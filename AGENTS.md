# 项目协作记忆（ZCode 自动读取）

本项目：家族族谱（微信小程序 + Web 预览版），目录见 README.md。

## 任务完成后的固定流程（必须执行）

每当一次任务完成，必须：

1. `git add -A` 暂存当前项目全部变更（新增、修改、删除）。
2. 提交，提交信息用中文、简要说明本次任务内容，例如：`feat: 新增大事记图片上传`。
3. 推送到远程仓库：

```bash
git push origin main
```

- 远程仓库固定为 `git@github.com:aheadlcx/FamilyTree.git`（origin）。
- 分支固定为 `main`。
- 若推送失败（如无网络/SSH 授权），先重试一次；仍失败则在回复中明确告知用户推送未完成及原因。
- `.gitignore` 中列出的构建产物（`build/`、`dist/` 等）与 `node_modules/` 不入库。

## 其他约定

- 小程序与 Web 版的业务逻辑保持一致：修改 `cloudfunctions/api/index.js` 的业务规则时，同步修改 `web/js/api.js`（反之亦然）。
- 全部 JS 改动后运行 `node --check` 做语法检查再提交。
