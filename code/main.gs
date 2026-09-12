/**
 * 先頭のゼロ落ちを防ぎプレーンテキストとして保持するカラム名一覧
 * @constant {string[]}
 */
const TEXT_COLUMNS = ['phone_mobile', 'phone_work', 'phone_fax', 'phone_other', 'postal_code'];

/**
 * Webアプリケーションのエントリポイント（HTTP GETリクエストのハンドラー）
 * ?page=help パラメータにより移行ヘルプページへのルーティングを実施
 * 
 * @param {Object} e - HTTP GETイベントオブジェクト
 * @return {HtmlOutput} レンダリングされたHTML出力オブジェクト
 */
function doGet(e) {
  // パラメータ ?page=help の場合はヘルプガイドを表示
  if (e && e.parameter && e.parameter.page === 'help') {
    return HtmlService.createTemplateFromFile('help')
      .evaluate()
      .setTitle('4U Card Nexus - データ移行・インポートガイド')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('4U Card Nexus')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Webアプリケーションの公開URLを取得する
 * 
 * @return {string} Webアプリの正規URL
 */
function getAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * スクリプトプロパティからシステム設定値を取得
 * 設定保存済みかどうかの初期化フラグ（isInitialized）も合わせて返却
 * 
 * @return {Object} settings
 * @return {string} settings.folderId - Googleドライブの保存先フォルダID
 * @return {string} settings.sheetName - データ連携対象のシート名
 * @return {boolean} settings.isInitialized - システム初期設定が完了しているかのフラグ
 */
function getAppSettings() {
  const props = PropertiesService.getScriptProperties();
  return {
    folderId: props.getProperty('DRIVE_FOLDER_ID') || '',
    sheetName: props.getProperty('SHEET_NAME') || '',
    // 初期設定が保存されたことがあるか（キーの存在有無で判定）
    isInitialized: props.getProperty('SYSTEM_INITIALIZED') === 'true'
  };
}

/**
 * システム設定値をスクリプトプロパティに永続化保存
 * 空欄での保存も正式な設定（デフォルト利用）として許容し、初期化完了フラグを付与
 * 
 * @param {Object} settings - 保存する設定オブジェクト
 * @param {string} [settings.folderId] - GoogleドライブフォルダID
 * @param {string} [settings.sheetName] - スプレッドシート名
 * @return {Object} 処理結果オブジェクト ({ success: true })
 * @throws {Error} 指定フォルダやシートが存在しない場合
 */
function saveAppSettings(settings) {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ドライブフォルダの実在確認（値が入力されている場合のみ検証）
  if (settings.folderId !== undefined) {
    const fId = settings.folderId.trim();
    if (fId) {
      try {
        DriveApp.getFolderById(fId);
      } catch (e) {
        throw new Error("指定されたGoogleドライブフォルダIDが無効か、アクセス権限がありません。");
      }
    }
    props.setProperty('DRIVE_FOLDER_ID', fId);
  }

  // スプレッドシート名の実在確認（値が入力されている場合のみ検証）
  if (settings.sheetName !== undefined) {
    const sName = settings.sheetName.trim();
    if (sName) {
      const sheet = ss.getSheetByName(sName);
      if (!sheet) {
        throw new Error("指定されたシート名「" + sName + "」がスプレッドシート内に見つかりません。");
      }
    }
    props.setProperty('SHEET_NAME', sName);
  }

  // 初回設定完了フラグを永続化（次回以降の強制ダイアログ表示を抑止）
  props.setProperty('SYSTEM_INITIALIZED', 'true');

  return { success: true };
}

/**
 * 操作対象のスプレッドシートオブジェクトを取得するヘルパー関数
 * 設定にシート名が存在する場合は指定シートを、未設定時はアクティブシートを返却
 * 
 * @return {GoogleAppsScript.Spreadsheet.Sheet} 操作対象のシートオブジェクト
 */
function getTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = PropertiesService.getScriptProperties().getProperty('SHEET_NAME');
  if (sheetName) {
    const s = ss.getSheetByName(sheetName);
    if (s) return s;
  }
  return ss.getActiveSheet();
}

/**
 * シートから全名刺データを読み込み、キー・バリュー形式のJSON配列として返却
 * ※フロントエンドSPAの初期ロードおよびキャッシュ構築に使用
 * 
 * @return {Object[]} 各名刺レコードのオブジェクト配列（各要素に _rowIndex を付与）
 */
function getCardsData() {
  const sheet = getTargetSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  // ヘッダー行の取得と前後の空白除去
  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  // データ行をオブジェクト配列にマッピング
  return rows.map((row, index) => {
    const item = { _rowIndex: index + 2 }; // スプレッドシート上の実態行番号（1-indexed, ヘッダー除外）
    headers.forEach((header, colIdx) => {
      let val = row[colIdx];
      // 不可視文字（ゼロ幅スペース等）を除去して正規化
      if (typeof val === 'string') {
        val = val.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
      }
      item[header] = val;
    });
    return item;
  });
}

/**
 * Base64形式の画像データをGoogleドライブにアップロードし、閲覧共有URLを取得
 * 
 * @param {string} base64Data - Data URLスキームを含むBase64エンコード文字列
 * @param {string} fileName - ドライブ保存時のファイル名
 * @return {string} アップロードされたファイルの共有閲覧URL
 * @throws {Error} 指定フォルダIDが無効またはアクセス権がない場合
 */
function uploadImageToDrive(base64Data, fileName) {
  const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  let folder;

  // 保存先フォルダの決定
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      throw new Error("指定されたGoogleドライブフォルダが見つかりません。設定を確認してください。");
    }
  } else {
    folder = DriveApp.getRootFolder();
  }

  // Base64からバイナリBlobを生成
  const contentType = base64Data.substring(5, base64Data.indexOf(';'));
  const bytes = Utilities.base64Decode(base64Data.split(',')[1]);
  const blob = Utilities.newBlob(bytes, contentType, fileName || ('card_' + Date.now() + '.jpg'));

  // ファイル作成
  const file = folder.createFile(blob);
  return file.getUrl();
}

/**
 * 新規名刺レコードをシート末尾に追加登録
 * 
 * @param {Object} formData - 登録フォームから送信された入力データ
 * @param {Object} [fileData] - アップロードされた画像ファイル情報
 * @param {string} fileData.base64 - 画像のBase64文字列
 * @param {string} fileData.filename - ファイル名
 * @return {Object} 処理結果オブジェクト ({ success: true, id: string })
 */
function createCardData(formData, fileData) {
  const sheet = getTargetSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());

  // 画像ファイルが存在する場合はドライブへアップロードしてURLを格納
  if (fileData && fileData.base64) {
    const fileName = (formData.full_name || 'card') + '_' + Date.now() + '.' + (fileData.filename.split('.').pop() || 'png');
    formData['item_link'] = uploadImageToDrive(fileData.base64, fileName);
  }

  // 一意のIDが未設定の場合はUUIDの先頭8文字を採番
  if (!formData['ID']) {
    formData['ID'] = Utilities.getUuid().slice(0, 8);
  }

  // ヘッダー順に合わせた行配列の生成（電話番号・郵便番号のゼロ落ちを防止）
  const newRow = headers.map(header => {
    let val = formData[header] || '';
    if (TEXT_COLUMNS.indexOf(header) !== -1 && val) {
      val = "'" + String(val).replace(/^'+/, '');
    }
    return val;
  });

  sheet.appendRow(newRow);
  return { success: true, id: formData['ID'] };
}

/**
 * 既存の名刺レコードを更新
 * 
 * @param {Object} formData - 更新フォームから送信された入力データ（_rowIndex 必須）
 * @param {Object} [fileData] - 新規アップロード画像ファイル情報（変更時のみ）
 * @param {string} fileData.base64 - 画像のBase64文字列
 * @param {string} fileData.filename - ファイル名
 * @return {Object} 処理結果オブジェクト ({ success: true })
 * @throws {Error} 無効な行番号が渡された場合
 */
function updateCardData(formData, fileData) {
  const sheet = getTargetSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());

  const rowIndex = parseInt(formData._rowIndex, 10);
  if (!rowIndex || rowIndex < 2) throw new Error("無効な行番号です。");

  // 新しい名刺画像が添付されている場合はドライブへアップロードしてリンク更新
  if (fileData && fileData.base64) {
    const fileName = (formData.full_name || 'card') + '_' + Date.now() + '.' + (fileData.filename.split('.').pop() || 'png');
    formData['item_link'] = uploadImageToDrive(fileData.base64, fileName);
  }

  // フォーム項目に対応する各セルを更新
  headers.forEach((header, idx) => {
    if (formData.hasOwnProperty(header)) {
      let val = formData[header];
      const range = sheet.getRange(rowIndex, idx + 1);

      // 電話番号・郵便番号はプレーンテキスト書式を設定してゼロ落ちを防止
      if (TEXT_COLUMNS.indexOf(header) !== -1 && val) {
        range.setNumberFormat('@');
        range.setValue(String(val).replace(/^'+/, ''));
      } else {
        range.setValue(val);
      }
    }
  });

  return { success: true };
}

/**
 * 指定された行番号の名刺データをシートから削除
 * 
 * @param {number|string} rowIndex - 削除対象の行番号（2以上の整数）
 * @return {Object} 処理結果オブジェクト ({ success: true })
 * @throws {Error} 削除対象の行番号が見つからない場合
 */
function deleteCardData(rowIndex) {
  const sheet = getTargetSheet();
  const rIdx = parseInt(rowIndex, 10);
  if (rIdx >= 2 && rIdx <= sheet.getLastRow()) {
    sheet.deleteRow(rIdx);
    return { success: true };
  }
  throw new Error("削除対象の行が見つかりません。");
}

/**
 * 外部データからマッピングされた名刺レコードを一括追加インポート
 * 
 * @param {Array<Object>} records - マッピング済みの名刺オブジェクト配列
 * @return {Object} 処理結果オブジェクト ({ success: true, count: number })
 * @throws {Error} インポート対象データが空の場合
 */
function importCardsBatch(records) {
  if (!records || records.length === 0) {
    throw new Error("インポートするデータが存在しません。");
  }

  const sheet = getTargetSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());

  // 一括挿入用の2次元配列を生成
  const rowsToAdd = records.map(item => {
    // IDが空の場合は一意なIDを採番
    if (!item['ID']) {
      item['ID'] = Utilities.getUuid().slice(0, 8);
    }
    // 姓と名が存在しフルネームが空の場合は自動結合
    if (!item['full_name'] && (item['last_name'] || item['first_name'])) {
      item['full_name'] = ((item['last_name'] || '') + ' ' + (item['first_name'] || '')).trim();
    }

    return headers.map(header => {
      let val = item[header] || '';
      // 電話番号・郵便番号のゼロ落ち防止
      if (TEXT_COLUMNS.indexOf(header) !== -1 && val) {
        val = "'" + String(val).replace(/^'+/, '');
      }
      return val;
    });
  });

  // シートの末尾へ一括書き込み（高速化）
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setValues(rowsToAdd);

  return {
    success: true,
    count: rowsToAdd.length
  };
}

/**
 * PHOTOタグ等のBase64画像付き名刺レコードをチャンク単位でドライブへ保存し、スプレッドシートへ一括書き込み
 * ※GASペイロード制限（20MB）および実行時間制限を回避するため分割送信される
 * 
 * @param {Array<Object>} chunk - 分割された名刺レコード配列（_photoBase64 を含む場合あり）
 * @return {Object} 処理結果オブジェクト ({ success: true, count: number })
 */
function importCardsWithImagesBatch(chunk) {
  if (!chunk || chunk.length === 0) {
    return { success: true, count: 0 };
  }

  const sheet = getTargetSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());

  // 名刺画像の保存先フォルダ取得
  const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  let folder;
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      folder = DriveApp.getRootFolder();
    }
  } else {
    folder = DriveApp.getRootFolder();
  }

  const rowsToAdd = [];

  // フォルダ内のファイルインデックス（キャッシュ）を作成して高速検索を可能にする
  const fileMap = {};
  if (folder) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      fileMap[f.getName()] = f.getUrl();
    }
  }

  chunk.forEach(item => {
    // 1. vCard埋め込み画像（PHOTOタグ）が存在する場合はドライブへ自動生成
    if (item._photoBase64) {
      try {
        const cleanBase64 = item._photoBase64.includes(',') ? item._photoBase64.split(',')[1] : item._photoBase64;
        const mimeType = item._photoMimeType || 'image/jpeg';
        const ext = mimeType.split('/')[1] || 'jpg';
        const bytes = Utilities.base64Decode(cleanBase64);
        const fileName = (item.full_name || 'card') + '_' + Date.now() + '.' + ext;
        const blob = Utilities.newBlob(bytes, mimeType, fileName);

        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        item['item_link'] = file.getUrl();
      } catch (err) {
        console.warn('名刺画像の一括ドライブ保存エラー:', err);
      }
    } 
    // 2. CSV移行等で画像ファイル名が指定されている場合、フォルダ内の既存ファイルと自動マッチング
    else if (item.item_link && !item.item_link.startsWith('http')) {
      const targetFileName = item.item_link.split(/[/\\]/).pop().trim(); // パス付き（images/001.jpg等）からファイル名のみ抽出
      if (fileMap[targetFileName]) {
        item.item_link = fileMap[targetFileName];
      }
    }

    if (!item['ID']) {
      item['ID'] = Utilities.getUuid().slice(0, 8);
    }
    if (!item['full_name'] && (item['last_name'] || item['first_name'])) {
      item['full_name'] = ((item['last_name'] || '') + ' ' + (item['first_name'] || '')).trim();
    }

    const row = headers.map(header => {
      let val = item[header] || '';
      if (TEXT_COLUMNS.indexOf(header) !== -1 && val) {
        val = "'" + String(val).replace(/^'+/, '');
      }
      return val;
    });

    rowsToAdd.push(row);
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rowsToAdd.length, headers.length).setValues(rowsToAdd);

  return {
    success: true,
    count: rowsToAdd.length
  };
}

/**
 * スプレッドシートにデータが追加された際、IDが空なら自動でUUIDを付与する
 */
function fillMissingIDs() {
  // シート名をスクリプトプロパティから取得
  const props = PropertiesService.getScriptProperties();
  const SHEET_NAME = props.getProperty('SHEET_NAME');
  
  if (!SHEET_NAME) {
    console.error('スクリプトプロパティに SHEET_NAME が設定されていません。');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    console.error(`シート「${SHEET_NAME}」が見つかりません。`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  
  data.shift(); // ヘッダー行を削除
  
  // 既存のIDをすべてSetに格納（高速な重複チェック用）
  const existingIds = new Set(data.map(d => d[23]).filter(String));

  data.forEach(function(d, index){
    const id = d[23]; // X列(ID)
    const name = d[3]; // D列(フルネーム)
    
    // IDが空、かつ、データ行である場合
    if (!id && name) {
      let uuid;
      // 重複しないUUIDが生成されるまでループ
      do {
        uuid = Utilities.getUuid().split("-")[0];
      } while (existingIds.has(uuid));
      
      existingIds.add(uuid); // 同一処理内での重複を防ぐためSetに追加
      sheet.getRange(index + 2, 24).setValue(uuid);
    }
  });
}
