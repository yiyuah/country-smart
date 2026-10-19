# 網站部署紀錄

網站：全國智家｜全國智慧居家

## 目前狀態

已發布第 1 版，但目前仍為僅擁有者可瀏覽。使用者已明確指定：任何人拿到網址都能瀏覽；公開權限仍待完成。

- 專案 ID：`appgprj_6ad5976adc088191b1b6893003778109`
- 上線原始碼：`site/`
- 部署設定：`site/.openai/hosting.json`
- 靜態網站檔案：`site/dist/`
- 已準備部署包：`qa/deployment.tar.gz`
- 已發布網址：`https://quanguo-zhijia.richorbit9.chatgpt.site`（目前僅限擁有者登入瀏覽）
- 原始碼 commit：`596f5d1b3b6cdba9879bc29aab0f2a4dfdaa6385`
- 已儲存版本：`appgprj_6ad5976adc088191b1b6893003778109~appgver_c5ba57700d2481918170d316d429619a`
- 成功部署 ID：`appgdep_6ad59c314a808191a996c7bd16efffc4`
- 部署狀態：`succeeded`，已由 Sites 確認
- 目前存取：`custom`，唯一允許的使用者為 owner，沒有群組

先前的原始碼同步阻礙已排除，程式與素材已推送。Windows 標準打包缺少 Bash，改用官方靜態準備工具及 Windows tar 的已校驗套件；已確認與乾淨 commit 相符，Sites 接受並儲存第 1 版。

目前唯一阻礙：`update_site_access(access_mode="public")` 先前兩次被自動執行核准逾時中止；2026-10-19 再試時，自動核准審查因所選模型容量不足而失敗，動作未執行。這不是安全性拒絕，也不是使用者未授權。不能把此網址描述成任何人皆可瀏覽。

## 替代託管準備（2026-10-19）

使用者已授權改用其他託管平台，目標仍為訪客不需登入、任何人都能瀏覽。

- 已備妥 `qa/public-site.zip`，解壓後根目錄即有 `index.html`，包含既有網站的 11 個檔案；不含文件、測試紀錄、Git 或個人帳號資料。
- 使用者已回覆「已登入」。2026-10-19 本次查詢整合仍回報 `installed: false`，此對話未取得 Vercel 部署工具；不應要求使用者再次登入網站。
- 若使用 Vercel，部署 `site/dist/` 為正式環境，選用靜態網站（Other），不需安裝依賴或建置。網站使用 hash 路由，不需額外改寫設定。完成後需檢查正式網址可由未登入訪客存取。
- Netlify 支援直接上傳此 ZIP，但官方文件指出未登入上傳的網址會受暫時密碼保護；認領後仍需依帳號方案確認公開設定。不可將未認領的臨時部署當作任務完成。
- 瀏覽器前往 Netlify 管理入口亦遇到相同的自動核准審查容量錯誤，動作未執行；尚未在其他平台建立部署。
- 使用者登入後，再次檢查瀏覽器仍被自動核准審查以「Selected model is at capacity」中止，動作未執行。嘗試使用官方 Vercel CLI：本機未預裝；透過 pnpm 下載時沙箱網路回報 ECONNREFUSED，已停止該程序。申請正常網路權限下載官方 npm 套件，也因相同的核准審查容量錯誤而未執行。沒有建立 Vercel 專案、部署、帳號憑證或付費方案。
- 已核對 Vercel Drop 官方文件（https://vercel.com/docs/drop）：已登入的使用者可到 https://vercel.com/drop，上傳 `qa/public-site.zip`，選擇自己的 team、輸入專案名稱 `quanguo-zhijia` 並按 Deploy。此流程直接發布正式環境，不需 Git 或 CLI。因代理操作被核准服務攔下，此步驟尚未執行；應取得成功產生的真實網址後，再驗證未登入存取，不可推測網址或聲稱已完成。

官方參考：

- https://vercel.com/docs/deployments
- https://vercel.com/docs/deployment-protection
- https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/

## 繼續發布

2026-10-19 使用者改選 GitHub，且確認目前尚未建立倉庫。GitHub 專用的純網站目錄已備於 `qa/github-pages/`，包含 11 個已逐一比對 SHA-256 的網站檔案及 `.nojekyll`。GitHub Pages 可直接從公開倉庫的預設分支根目錄發布（Settings → Pages → Deploy from a branch → 預設分支 → /(root)）。目前 GitHub 整合未安裝、`gh` 未預裝、本機 `site/` 無 GitHub remote。使用者已獲 GitHub 整合建議，但尚未確認連線。嘗試透過瀏覽器開啟 `https://github.com/new` 時，瀏覽器權限審查因「Selected model is at capacity」拒絕授予 github.com 網路來源權限；動作未執行，且明確禁止以其他自動化路徑繞過。尚未建立倉庫或完成 GitHub Pages 發布。

GitHub 官方說明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

1. 重用既有專案 ID，不要再次建立網站或重複發布相同版本。
2. 讀取網站目前存取設定；依使用者已確認的要求，完成 `public` 權限變更。
3. 確認公開存取成功後，即可把現有網址當成免登入的公開網站分享。
4. 只有網站檔案有修改時，才需要 `node qa/prepare-site.cjs`、更新原始碼、準備部署包與發布新版本。

部署只包含五個網站程式檔、四張照片、原始 MP4 與地區 JSON，不包含本機測試報告、壓縮檔、瀏覽器紀錄或個人資料。
