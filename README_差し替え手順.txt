修正内容:
・pdf.destroy() を使わない処理に変更
・PDF.js を 4.10.38 に固定
・PDF内テキストがある場合は先に直接抽出、画像PDFの場合だけOCR

差し替え手順:
1. GitHubの engineoil リポジトリを開く
2. app.js を開く
3. 右上の鉛筆マークで編集
4. このZIP内の app.js の中身を全コピーして貼り替え
5. Commit changes
6. 数分後に https://r34face.github.io/engineoil/ を Ctrl+F5 で更新
