# Code Review Worker

一个基于 Kafka 的提交评审脚本：

1. 消费 `code-events` 主题中的 `git.commit` 事件
2. 拉取或更新对应仓库，并 checkout 到指定 commit
3. 调用 Claude Agent SDK，让它在仓库上下文中结合项目内 `CLAUDE.md` / `.claude/skills` 做 review
4. 解析评分
5. 评分低于阈值时，通过飞书机器人在群里提醒对应提交人

## 设计说明

- Claude 评审运行在目标代码仓库目录下
- 开启 `settingSources: ['project']`，让 SDK 读取项目级 skills 和记忆文件
- 默认放开 `Skill, Read, Glob, Grep, Bash`，让 Claude 能主动调用项目 skills
- 脚本要求 Claude 输出严格 JSON，便于自动化解析
- 飞书 `@` 使用 `FEISHU_USER_ID_MAP_JSON` 做邮箱到飞书用户 ID 的映射

## 安装

```bash
npm install
cp config.yaml.example config.yaml
cp feishu-users.example.json feishu-users.json
```

## 关键配置

- 所有运行配置统一写在项目根目录的 `config.yaml`
- `repo.repos.<repoKey>.localPath`: 某个仓库专属的本地路径
- `repo.repos.<repoKey>.cloneUrl`: 某个仓库专属的 clone 地址
- `repo.repos.<repoKey>.rewrite.from/to`: 某个仓库专属的地址改写规则
- `repo.defaultRewrite.from/to`: 全局默认地址改写规则
- `claude.minScore`: 低于该分数触发飞书告警
- `feishu.userMapFile`: 飞书用户映射 JSON 文件路径

## 运行

```bash
npm start
```

配置文件示例见 [config.yaml.example](/Users/giming/code/code-review/config.yaml.example)。
飞书用户映射示例见 [feishu-users.example.json](/Users/giming/code/code-review/feishu-users.example.json)。

## Claude 输出格式

脚本会要求 Claude 输出如下 JSON：

```json
{
  "score": 0,
  "summary": "",
  "risks": [],
  "must_fix": [],
  "nice_to_have": [],
  "should_alert": false
}
```

## 注意

- 这里默认使用 Anthropic 官方 Agent SDK 包：`@anthropic-ai/claude-agent-sdk`
- 飞书邮箱映射 JSON 使用 `email -> user info` 结构，当前实际只用到 `id` 和 `name`
