# 全國智家｜全國智慧居家

網站：https://yiyuah.github.io/country-smart/

## 網站檔案

根目錄是唯一的 GitHub Pages 發布目錄：

- `index.html`：網站入口
- `styles.css`：版面與閱讀輔助樣式
- `app.js`：頁面與互動流程
- `data.js`：家電教學與地區資料
- `icons.js`：圖示
- `brand.js`、`brand.css`：暖紅色封面、FAQ 與共用品牌樣式
- `speech-reader.js`：依真實語音事件同步提示、暫停／繼續與降級處理
- `assets/`：四張照片、介紹影片與地區 JSON
- `.nojekyll`：直接發布靜態檔案

GitHub Pages 使用 `main` 分支的 `/(root)`。修改根目錄的程式或 `assets/` 後提交，待 Pages 工作流程完成即可更新網站。不需要建置或安裝套件。

## 功能範圍

提供家電教學、閱讀輔助、家電清單與服務需求整理。清單、進度與需求只保存在目前瀏覽器。電話客服、正式門市查詢及預約送出尚未接通；需求儲存不代表已送交門市。

原有照片與影片為專案提供素材。`assets/hero-home.webp` 為本次透過 ImageGen 製作並壓縮的居家形象照片；`assets/logo*.svg` 與 `assets/favicon.svg` 是本專案獨立設計的房屋、連線與陪伴符號，提供完整、符號及深淺底版本。

## 封面與舊連結

不帶 hash 的網址開啟品牌封面；`#landing` 也可開啟封面。立即體驗進入 `#home`，原本的 `#scan`、`#learn`、`#my`、`#help` 及工作台路由持續有效。資料仍使用原來的 `zhijia-v1` 與 `zhijia-prefs-v1`，不會因改版清空。

## 語音與同步提示

以 Web Speech API 的 `onstart`、`onboundary`、`charIndex`、`charLength`、`onend`、`onerror` 追蹤實際語音。CSS Custom Highlight API 使用 Range 映射原有文字節點，不包裝或改寫連結與按鈕；UTF-16 索引以字素邊界對齊。只提供句子事件或沒有字詞長度時，標示正在朗讀的句子；舊瀏覽器以段落樣式降級。沒有以固定時間猜測逐字位置。

不同瀏覽器、系統語音和中文語音引擎支援不同。精準逐字同步取決於實際 boundary 事件，不能保證所有裝置相同。暫停與繼續以系統語音引擎為準，若裝置無法恢復，可停止後重新朗讀。

## 維護與發布

使用獨立分支完成修改與測試後合併 `main`。入口 CSS 與 JavaScript 附有版本參數；更新資源時同步變更版本，降低快取混用。測試、截圖與開發文件留在本機 `qa/`，不加入公開發布內容。
