# Code Review Worker

一个基于 Kafka 的单次提交评审 Worker。

处理流程：

1. 消费 `code-events` 主题中的 `git.commit` 事件
2. 根据 Kafka 消息中的 `repo.key` 定位本地仓库，fetch 目标提交并创建临时 worktree
3. 按仓库配置加载对应的 `CheckList.md`
4. 在临时 worktree 中调用 Claude Code CLI，基于目标仓库完整上下文执行单次提交审查
5. 输出 Markdown 评审报告到 `ai/CodeReview/Reports/`

## 设计说明

- 当前实现固定为“单次提交审查”，只 review Kafka 事件对应的 commit
- Claude 评审运行在目标提交对应的临时 worktree 下，能读取完整业务仓库上下文
- 真实业务仓库只做 fetch，不会被留在 detached HEAD
- 默认放开 `Skill`、`Read`、`Glob`、`Grep`、`Bash`，让 Claude 能主动读取仓库上下文
- Worker 会在启动目录读取仓库专属 checklist，并把内容直接注入 prompt
- checklist 负责固化每个仓库的审查边界、重点风险和输出要求

## 安装

```bash
npm install
cp feishu-users.example.json feishu-users.json
cp config.yaml.example config.yaml
```

## 关键配置

- 所有运行配置统一写在项目根目录的 `config.yaml`
- `kafka.brokers`: Kafka broker 列表
- `repo.localPaths.<repoKey>`: Kafka 事件中的 `repo.key` 到本地仓库路径的映射
- `repo.checklistPaths.<repoKey>`: 当前仓库使用的 `CheckList.md` 路径
- `repo.reviewWorkspaceRoot`: 临时 review worktree 的根目录，可选，默认 `./ai/CodeReview/Worktrees`
- `claude.maxTurns`: 单次提交审查允许的最大轮数
- `feishu.userMapFile`: 飞书用户映射 JSON 文件路径

示例：

```yaml
repo:
  localPaths:
    "example-org/example-repo": "D:\\work_code\\example-repo"
  checklistPaths:
    "example-org/example-repo": "./checklists/example-repo.CheckList.md"
  reviewWorkspaceRoot: "./ai/CodeReview/Worktrees"
```

## CheckList 约定

- 每个仓库单独配置一个 `CheckList.md`
- checklist 文件放在 Worker 仓库内更稳妥，推荐放到 `checklists/`
- checklist 应聚焦该仓库的业务规则、兼容性要求、常见回归点和输出格式
- 当前已提供示例文件：[ronds.supercare.backend.CheckList.md](/mnt/d/ronds_code_tool/ai_tools/code-review/checklists/ronds.supercare.backend.CheckList.md)

## 运行

```bash
npm start
```

运行配置请直接编辑项目根目录下的 `config.yaml`。
飞书用户映射示例见 [feishu-users.example.json](/mnt/d/ronds_code_tool/ai_tools/code-review/feishu-users.example.json)。

## 注意

- 默认使用 `@anthropic-ai/claude-agent-sdk`
- 不再自动 clone 仓库，目标仓库必须已经存在于本地，并在 `repo.localPaths` 中配置映射
- 如果配置了 `repo.checklistPaths.<repoKey>`，对应文件必须存在且不能为空
