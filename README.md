# WorkspaceStudio × GAS による名刺管理システム
本プロジェクトは、Googleから提供されている `Workspace Studio` と `Google Apps Script` を用いた名刺管理システムを構築する手順書である。これを用いることで、Workspaceに閉じた世界での構築が可能であり、（Workspaceアカウントにおいては）エンタープライズセキュリティで保護された名刺管理システムが爆誕する。

> [!WARNING]  
> GitHubの仕様上、各種リンクは同じタブで開かれます。現在のページを残したままリンク先を閲覧したい場合は、**`Ctrl` キー（Macの場合は `Command` キー）を押しながらクリック**するか、マウスのホイールボタンでクリックしてください。


## 推奨環境
本システムでは、Workspace Studioを用いたGeminiによる名刺画像の自動解析および台帳登録を推奨しており、Workspace Studioが利用できる状態であることが望ましい。システム自体に名刺登録機能（手動）も設けているため必須ではない。

## 実演
以下Youtubeにて、実演を公開しているため、参考とすること。  
[こーすけ先生のGoogle塾 -【有料級】セキュアな名刺管理アプリを「Workspace Studio×AppSheet」で自作する手順を公開します-](https://www.youtube.com/watch?v=ot2Ua4P20mI)

## 準備
1. 以下リンクよりスプレッドシートのコピーを自身のドライブに保存する。  
   [スプレッドシートリンク](https://docs.google.com/spreadsheets/d/1rW5DPezaiUV1LRnrAcPQRzzHS_4dMAg_oRHLxMQW-qs/edit?usp=drive_link)  
   1. 上記よりスプレッドシートを開く
   2. メニューより [ファイル] > [コピーを作成] を押下する  
      <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/37d86611-116a-464a-b0b3-a3fc8dd34ea0" />  
  
   3. 確認ダイアログが表示されるため、ファイル名や格納先を選択して、「コピーを作成」を押下する  
      <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/42391203-74c0-4330-b4a1-ff9c90ca5920" />  
  
2. 名刺データの格納フォルダを作成する。本フォルダが後述する `Workspace Studio` におけるトリガーフォルダとなる。
3. 名刺データの取り込み済みフォルダを作成する。本フォルダはすでに処理済みの名刺データを格納する領域となる。

## 実装
### 1. Workspace Studio
1. Workspace Studioにアクセスする。[Workspace Studio](https://studio.workspace.google.com/)
2. 左側メニューの「フローを新規作成する」を押下し、ワークフロー作成画面に遷移する。  
   <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/f0e0f66e-2de8-4418-b405-0743542c0b9a" />  
  
3. 以下の手順書に従って、WorkspaceStudio上にフローを作成する。  
   [WorkspaceStudio構築補助手順書](https://docs.google.com/document/d/1qCFVFs0elrgNmBaoJsovz6sFZ2uJAwIkz3yscGqEdRg/edit?usp=sharing)

### 2. スプレッドシート（GAS）
1. `準備の 1` で作成したスプレッドシートを開く
2. メニューより [拡張機能] > [Apps Script] を押下する。  
   <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/d6d6eb4f-7a36-40c9-b726-da9ba9d1c8eb" />  
  
3. 左側メニュー[トリガー]を押下し、以下のトリガーをそれぞれ作成する。  
   <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/026f73c3-9462-46e8-854a-15a5f24907e9" />  
  
| 実行する関数 | 実行するデプロイ | イベントのソース | 詳細 | 説明 | 
|:---|:---:|:---|:---|:---|
| fillMissingIDs | Head | スプレッドシートから | 変更時 | WorkspaceStudioからスプシにデータが取り込まれた際に一意のIDを付与する |
| fillMissingIDs | Head | 時間主導型 | 日付ベースのタイマー: 午前1時〜2時 | スプシの変更トリガーがたまにスカるときがあるため、予備トリガー |

  
> [!TIP]
> トリガーを設定しようとすると本プログラムの承認権限を付与するダイアログが表示されるため、画面に従って承認を行う。  
>   <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/d65893ce-764d-4662-be27-edc2674752df" />  
   
   
4. 左側メニュー[エディタ]に戻り、右上の [デプロイ] > [新規デプロイ] を押下する。  
   <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/eef34aa9-63b7-4ace-9e3e-f4b2818465db" />  
  
5. デプロイ設定ダイアログが表示されるため、以下のように入力し、 [デプロイ] を押下する。
   1. 説明: アプリケーション名等任意で入力
   2. 次のユーザーとして実行: 自分
   3. アクセスできるユーザー: 自分のみ   
      <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/83629755-fbc4-4f26-b264-f2d860095f83" />  
   
6. デプロイ完了画面が表示され、アプリケーションのURLが発行されるため、アクセスする。  
   <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/e3e98b1b-7ba8-4ff2-8978-378fd5d3f852" />  
   
7. アプリケーション起動時に各種設定ダイアログが表示されるため、以下のように設定する。  
   1. データベースシート名: スプシの名刺台帳となっているシート名（設定しなければ0番目のシートが自動選択される）
   2. 名刺画像格納フォルダID: 名刺データをアップロードする領域。WorkspaceStudioとの連携も行っている場合には、準備`3`で作成した処理済みフォルダのIDを入力すること。  
      <img width="1440" height="810" alt="Image" src="https://github.com/user-attachments/assets/7a444545-09ab-47df-ab43-711652f43409" />

> [!TIP]
> フォルダIDはGoogleドライブでフォルダを開いた際のURLから確認ができる。例えば、以下URLの場合においては、`folders/`以降の `1Qm-QQr99999999999999999999DnQAgO` がフォルダIDとなる。  
> https://drive.google.com/drive/folders/1Qm-QQr99999999999999999999DnQAgO
