# 中文语义动漫推荐

一个中文优先的动漫推荐方法论、Codex Skill 和实验性 TypeScript CLI。

这个项目当前不是一个大型推荐系统，也不是简单的热门榜单抓取器。它更像一套可复用的推荐流程：先理解用户真正喜欢的观看体验，再用 Bangumi、AniList 等高质量数据源核实作品事实，最后用 LLM 的语义能力解释“为什么这部作品适合你”。

## 这个项目是什么

- 一个面向中文用户的 Codex 动漫推荐 Skill。
- 一套轻量的语义推荐方法论：关系模式、情绪口感、叙事节奏、故事核心、避雷点。
- 一个实验性的本地 CLI：可以缓存 Bangumi/AniList 元数据、记录用户反馈、测试推荐启发式规则。

## 安装 Skill

如果你只是想让 Codex 学会这套动漫推荐方法，安装 Skill 即可，不需要运行本地 CLI。

### 方式一：Codex 一行安装

```bash
npx clawhub --workdir ~/.codex --dir skills install anime-semantic-recommender
```

这会通过 ClawHub 把 Skill 安装到 Codex 的 `~/.codex/skills` 目录，不需要 clone 仓库。

然后重启 Codex，直接这样问：

```text
用 anime-semantic-recommender 推荐几部像芙莉莲那样有余韵、但不要王道热血的动画。
```

更新这个安装方式得到的 Skill：

```bash
npx clawhub --workdir ~/.codex --dir skills update anime-semantic-recommender
```

### 方式二：从 GitHub clone

如果你想查看源码、修改文档或跟踪 GitHub 仓库，也可以直接 clone 到 Codex 的 skills 目录：

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/KAMIENDER/anime-semantic-recommender.git ~/.codex/skills/anime-semantic-recommender
```

更新 clone 方式安装的 Skill：

```bash
cd ~/.codex/skills/anime-semantic-recommender
git pull
```

安装后同样需要重启 Codex。

## 推荐思路

传统标签推荐很容易停在“同为校园恋爱”“同为奇幻冒险”这一层，但用户真正想找的往往更细：

- “像芙莉莲那种有时间流逝后的余韵，但不要王道热血”
- “想看女主主动靠近男主、低压力、慢慢变甜的校园恋爱”
- “这些热门我大多看过，能不能往中腰部和旧作里找”

所以默认流程是：

```text
理解用户喜欢的体验
  -> 抽取相似维度
  -> 用高质量数据源确认事实和候选边界
  -> 分层推荐
  -> 解释像在哪里、哪里不同、可能不适合谁
  -> 根据用户反馈继续收窄
```

## 数据源原则

只要事实会影响推荐，就不要依赖搜索引擎摘要、SEO 榜单、搬运简介站或 AI 生成榜单。优先级是：

1. 官方动画、出版社、流媒体页面：播出状态、改编状态、制作方、集数、staff、cast、版权上线情况。
2. Bangumi：中文名、中文 ACG 语境、标签、评分、收藏、条目关系、社区热度。
3. AniList：结构化标签、格式、人气、跨语种标题、API 友好元数据。
4. MAL/Jikan：国际热度和补充元数据。
5. TMDb：海报、图片和通用媒体资料，不作为动漫口味判断主源。

LLM 可以负责语义判断和推荐解释，但作品事实应尽量来自高质量数据源。

## 实验 CLI 快速开始

下面是实验性本地 CLI 的用法。它不是使用 Skill 的必要步骤。

要求：

- Node.js 22.5 或更新版本。
- npm。
- 可选：设置 `OPENAI_API_KEY` 后启用 LLM 画像生成和精排。

```bash
npm install
npm run build
npm run smoke
```

试一次本地推荐：

```bash
npm run recommend -- "想看像芙莉莲那种，有余韵但不要王道热血" -- --limit 5 --no-network
```

搜索数据源元信息：

```bash
npm run search -- "葬送的芙莉莲"
```

记录反馈：

```bash
npm run feedback -- "少女终末旅行" -- --seen --liked --comment "方向对"
npm run profile
```

## Codex Skill

Skill 入口是 [SKILL.md](SKILL.md)。它要求 Codex：

- 默认先做轻量口味分析，而不是直接调用本地 CLI。
- 如果用了搜索/浏览，先查官方、Bangumi、AniList、MAL/Jikan 或 TMDb，不把搜索摘要当事实。
- 每个推荐都解释“像在哪里”“哪里不同”“可能不适合谁”。
- 用户反馈后立刻调整方向，避免反复推荐同一批热门作品。

更短的方法论见 [docs/simple-methodology.md](docs/simple-methodology.md)。
更完整的工程化方案见 [docs/technical-plan.md](docs/technical-plan.md)。

## 当前状态

这是一个早期个人使用 MVP。当前本地种子库很小，偏向“余韵、旅途、治愈、世界观、克制叙事”这类作品。CLI 适合验证思路是否能工程化，但现阶段最重要的产物仍然是中文推荐方法论和 Codex Skill。

## 许可证

MIT
