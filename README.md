# ツボマップ v1（前面・後面）
- 症状プルダウン → 推奨ツボが表示（点が光る）
- ラベルは常時表示（漢字＋カナ）／点タップで詳細
- 表示モード：初心者（厳選3–6穴）／全穴（収録分のみ）
- 座標系：viewBox 0–100 x 0–230（前面・後面で共通）

## 使い方（GitHub Pages）
1. このフォルダをリポジトリにpush（例：`tsubo-map`）。
2. GitHubのSettings → Pages → Branchを`main`/`docs`などに設定。
3. 公開URLで `index.html` が開きます。

データは `data/*.json` を編集してください。
座標追加は `data/coords.json` に point id を追記します。
