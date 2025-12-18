# ツボマップ v1（前面・後面）
- 症状プルダウン → 推奨ツボが表示（点が光る）
- 表示モード：初心者（厳選3–6穴）／全穴（収録分のみ）
- 3Dモデル（glb）を画面右側に表示（ドラッグで回転/ズーム）

## 使い方（GitHub Pages）
1. このフォルダをリポジトリにpush（例：`tsubo-map`）。
2. GitHubのSettings → Pages → Branchを`main`/`docs`などに設定。
3. 公開URLで `index.html` が開きます。

データは `data/*.json` を編集してください。
座標追加は `data/coords.json` に point id を追記します。

## 3Dモデル（three.js / glb）
- `index.html` 下部に three.js の簡易ビューアを追加しています（`tubo1/app.js`）。
- 読み込むモデルはデフォルトで `../scene (2).glb` を参照しています（必要なら `tubo1/app.js` の `modelUrl` を変更）。
