# Repository Guidelines

## 项目结构与模块组织
本仓库是一个基于 Node.js 的代码评审 Worker，运行时代码集中在 `src/`：

- `src/index.js`：程序入口、启动流程与全局错误处理。
- `src/kafka-consumer.js`：消费提交事件。
- `src/repo-manager.js`：拉取、更新并切换目标仓库代码。
- `src/claude-reviewer.js`：执行 Claude 评审流程。
- `src/feishu.js`：发送低分告警到飞书。
- `src/config.js`：加载并解析 `config.yaml`。

根目录提供示例配置文件：`config.yaml.example` 和 `feishu-users.example.json`。新增模块应继续放在 `src/` 下，并按职责拆分，而不是为未来扩展预先分层。

## 构建、测试与开发命令
- `npm install`：安装依赖。
- `cp config.yaml.example config.yaml`：生成本地运行配置。
- `cp feishu-users.example.json feishu-users.json`：生成飞书用户映射文件。
- `npm start`：使用 `node src/index.js` 启动 Kafka Worker。
- `npm run check`：对 `src/*.js` 执行 Node 语法检查。

当前项目没有独立构建步骤，直接基于 Node.js 20+ 和 ES Modules 运行。

## 编码风格与命名约定
使用现代 ESM JavaScript，导入本地文件时显式带上 `.js` 后缀。代码风格以现有实现为准：

- 使用 2 空格缩进，并保留分号。
- 字符串优先使用双引号。
- 函数名、变量名使用 `camelCase`。
- 模块保持职责单一，优先使用具名导出。

像 `src/config.js` 这类解析逻辑，优先拆成小而纯的辅助函数。若增加格式化或校验工具，保持轻量，避免引入不必要的构建链路。

## 测试要求
当前仓库尚未引入正式的自动化测试框架。至少应做到：

- 提交前运行 `npm run check`。
- 对改动涉及的配置加载、事件处理链路做人工验证。
- 若新增复杂逻辑，可同步引入对应测试。

后续若补充测试文件，建议按模块命名，例如 `config.test.js`、`repo-manager.test.js`。

## 提交与 Pull Request 要求
现有提交信息采用简短、祈使句风格，例如 `Switch to YAML config and repo-specific settings`。新增提交也应遵循这一模式：

- 标题简洁，直接描述动作。
- 一个提交只解决一个逻辑问题。
- PR 描述中说明行为变化、配置影响和人工验证方式。

如果改动涉及 Kafka 消费、Claude 输出解析或飞书通知，建议附上示例事件、关键日志或告警截图。

## 配置与安全
不要提交真实密钥、Webhook 地址或本地环境文件。运行配置应基于 `config.yaml.example` 生成，并将敏感仓库地址、用户映射和告警数据在评审或 PR 中做脱敏处理。
