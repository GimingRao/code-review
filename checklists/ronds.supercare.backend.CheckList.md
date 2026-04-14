# ABP .NET 代码审查检查清单

本文档包含 ABP .NET 代码审查的详细检查项，供 SKILL.md 调用。

## 1. 架构与设计审查

### DDD 分层架构

#### Domain 层
- [ ] 实体 (Entity) 是否正确继承 `AggregateRoot` 或 `Entity<TKey>`
- [ ] 值对象 (Value Object) 是否使用正确且不可变
- [ ] 领域事件是否在聚合根内正确触发
- [ ] 业务规则是否封装在领域层而非应用层
- [ ] 是否避免在 Domain 层引用基础设施依赖

#### Application 层
- [ ] 应用服务是否继承 `ApplicationService` 或 `CrudAppService`
- [ ] DTO 是否定义在 Contracts 项目中
- [ ] 是否正确使用 `AutoMapper` 进行实体与 DTO 转换
- [ ] 事务边界是否在应用服务层正确设置 (`[UnitOfWork]`)
- [ ] 是否避免在应用服务中编写业务逻辑（应委托给领域层）

#### Contracts 层
- [ ] DTO 是否为纯数据传输对象，无业务逻辑
- [ ] 接口定义是否清晰且符合单一职责原则
- [ ] 是否正确使用数据注解进行验证 (`[Required]`, `[StringLength]` 等)

#### EfCore 层
- [ ] `DbContext` 是否正确继承 `AbpDbContext<T>` 或 Athene 的基类
- [ ] 实体配置是否使用 Fluent API 而非数据注解
- [ ] 是否正确配置索引、关系和约束

#### HttpApi.Host 层
- [ ] 控制器是否正确继承 `AbpController`
- [ ] 路由配置是否遵循 RESTful 规范
- [ ] 是否正确配置 Swagger/OpenAPI 文档
- [ ] 依赖模块是否在 `Module.cs` 中正确声明

### 模块化设计
- [ ] 模块依赖关系是否清晰且单向
- [ ] 是否避免循环依赖
- [ ] 模块边界是否明确，职责是否单一
- [ ] 跨模块通信是否通过事件总线或 API 而非直接引用

---

## 2. 代码质量审查

### 命名规范

#### 类型命名
- [ ] 类名是否使用 PascalCase（例如：`UserService`、`OrderManager`）
- [ ] 接口是否以 `I` 开头并使用 PascalCase（例如：`IUserRepository`、`IOrderService`）
- [ ] 抽象类是否使用 `Base` 或 `Abstract` 后缀
- [ ] 枚举类型是否使用 PascalCase 单数形式（例如：`OrderStatus`、`UserRole`）
- [ ] 泛型类型参数是否以 `T` 开头（例如：`TEntity`、`TKey`、`TDto`）

#### 成员命名
- [ ] 公共属性、方法是否使用 PascalCase
- [ ] 私有字段是否以 `_` 开头并使用 camelCase（例如：`_userRepository`）
- [ ] **参数命名**是否严格遵循 .NET 规范使用 camelCase
  - ❌ 错误：`UserId`、`UserName`（参数不应使用 PascalCase）
  - ✅ 正确：`userId`、`userName`
- [ ] 局部变量是否使用 camelCase
- [ ] 常量是否使用 PascalCase 或 UPPER_SNAKE_CASE
- [ ] 事件是否使用动词过去式或名词（例如：`OrderCreated`、`DataChanged`）

#### 异步方法命名
- [ ] 异步方法是否以 `Async` 结尾（例如：`GetUserByIdAsync`、`SaveChangesAsync`）
- [ ] 异步方法返回类型是否为 `Task` 或 `Task<T>`（不使用 `async void`，除非是事件处理器）
- [ ] 异步方法命名是否与同步版本对应

#### 语义化命名
- [ ] 命名是否具有明确的业务含义，能够自解释
- [ ] 是否避免使用拼音命名（例如：避免 `YongHu`，应使用 `User`）
- [ ] 是否避免无意义的缩写（例如：避免 `usrMgr`，应使用 `userManager`）
- [ ] 是否避免使用单字母变量名（除循环计数器 `i`、`j`、`k` 外）
- [ ] 布尔类型是否使用 `Is`、`Has`、`Can` 等前缀（例如：`IsActive`、`HasPermission`、`CanEdit`）
- [ ] 集合类型是否使用复数形式或带 `List`/`Collection` 后缀

#### 业务领域命名
- [ ] 领域实体命名是否反映业务概念（例如：`Asset`、`WorkOrder`、`MaintenancePlan`）
- [ ] 仓储接口是否以 `Repository` 结尾（例如：`IAssetRepository`）
- [ ] 应用服务是否以 `AppService` 或 `Service` 结尾（例如：`UserAppService`、`OrderService`）
- [ ] DTO 是否以 `Dto` 结尾（例如：`CreateUserDto`、`UserListDto`）

### 代码风格
- [ ] 是否遵循 C# 编码规范
- [ ] 方法长度是否合理（建议 < 50 行）
- [ ] 类长度是否合理（建议 < 500 行）
- [ ] 是否避免过深的嵌套（建议 < 4 层）
- [ ] 是否使用 C# 最新语言特性（模式匹配、表达式体成员等）
- [ ] 是否正确使用 `var` 关键字

### 注释与文档
- [ ] 公共 API 是否包含 XML 文档注释
- [ ] 复杂业务逻辑是否有中文注释说明
- [ ] 注释是否与代码同步更新
- [ ] 是否避免冗余注释（代码自解释）
- [ ] 是否包含必要的 TODO/FIXME 标记

---

## 3. ABP Framework 最佳实践

### 依赖注入
- [ ] 是否正确使用 ABP 的依赖注入特性 (`ITransientDependency`, `ISingletonDependency`, `IScopedDependency`)
- [ ] 是否避免使用 `new` 关键字创建服务实例
- [ ] 是否正确注入 `IRepository<TEntity>` 或自定义仓储
- [ ] 是否避免在构造函数中执行业务逻辑

### 权限与授权
- [ ] 是否正确使用 `[Authorize]` 特性
- [ ] 权限定义是否在 `PermissionDefinitionProvider` 中声明
- [ ] 是否使用 `IAuthorizationService` 进行细粒度权限检查
- [ ] 是否避免硬编码权限字符串

### 数据验证
- [ ] DTO 是否使用数据注解或 FluentValidation 进行验证
- [ ] 业务规则验证是否在领域层执行
- [ ] 是否正确抛出 `UserFriendlyException` 或 `BusinessException`

### 审计日志
- [ ] 重要操作是否启用审计日志 (`[Audited]`)
- [ ] 敏感数据是否正确标记不记录 (`[DisableAuditing]`)
- [ ] 是否正确实现 `IHasCreationTime`, `IHasModificationTime` 等接口

### 多租户
- [ ] 是否正确处理多租户场景 (`IMultiTenant`)
- [ ] 查询是否自动应用租户过滤器
- [ ] 是否避免租户数据泄露

### 本地化
- [ ] 用户提示信息是否使用本地化资源 (`IStringLocalizer`)
- [ ] 是否避免硬编码用户可见文本
- [ ] 本地化 Key 是否规范且易于维护

---

## 4. Athene Framework 特定审查

### 事件总线 (Kafka)
- [ ] 事件 DTO 是否正确定义且可序列化
- [ ] 事件发布是否使用 `IEventBus.PublishAsync<TEvent>()`
- [ ] 事件处理器是否实现 `IEventHandler<TEvent>`
- [ ] 事件处理器是否注册到 DI 容器
- [ ] 事件处理是否具有幂等性
- [ ] 是否正确处理事件处理失败场景

### 配置管理
- [ ] 配置是否通过 `IOptions<T>` 或 Consul 读取
- [ ] 是否避免硬编码配置值
- [ ] 敏感配置是否使用 Secret Manager

---

## 5. 性能审查

### 数据库查询

#### 查询性能优化
- [ ] 是否避免 N+1 查询问题（使用 `Include` 或 `ThenInclude` 预加载关联数据）
- [ ] 是否合理使用分页查询（`IPagedResultRequest`、`Skip`、`Take`）
- [ ] 是否正确使用 `AsNoTracking()` 提升只读查询性能
- [ ] 是否避免全表扫描（添加必要的索引）
- [ ] 是否使用投影查询减少数据传输（`Select` 仅查询需要的字段）
- [ ] 大数据量查询是否使用流式处理或分批加载

#### 循环中的数据库操作（重要）
- [ ] **严禁**在 `for`/`foreach`/`while` 循环内直接调用数据库查询方法
  ```csharp
  // ❌ 错误示例
  foreach (var userId in userIds)
  {
      var user = await _userRepository.GetAsync(userId); // 每次循环都查询数据库
  }

  // ✅ 正确示例
  var users = await _userRepository.GetListAsync(u => userIds.Contains(u.Id)); // 一次性查询
  ```
- [ ] **严禁**在循环内执行 `SaveChanges()` 或 `SaveChangesAsync()`
  ```csharp
  // ❌ 错误示例
  foreach (var order in orders)
  {
      order.Status = OrderStatus.Completed;
      await _dbContext.SaveChangesAsync(); // 每次循环都保存
  }

  // ✅ 正确示例
  foreach (var order in orders)
  {
      order.Status = OrderStatus.Completed;
  }
  await _dbContext.SaveChangesAsync(); // 循环结束后一次性保存
  ```
- [ ] **严禁**在循环内执行单条插入/更新/删除操作
  ```csharp
  // ❌ 错误示例
  foreach (var dto in dtos)
  {
      await _repository.InsertAsync(new Entity(dto)); // 每次循环都插入
  }

  // ✅ 正确示例
  var entities = dtos.Select(dto => new Entity(dto)).ToList();
  await _repository.InsertManyAsync(entities); // 批量插入
  ```
- [ ] 循环处理大量数据时，是否使用批处理方式（如 `EF Core` 的 `ExecuteUpdateAsync`/`ExecuteDeleteAsync`）
- [ ] 循环内必须查询时，是否先将所有 ID 收集后批量查询，再在内存中匹配

### 缓存策略
- [ ] 高频查询是否使用 Redis 缓存
- [ ] 缓存 Key 命名是否规范且唯一
- [ ] 缓存过期策略是否合理
- [ ] 是否正确处理缓存击穿、穿透、雪崩

### 异步编程

#### 异步方法使用
- [ ] I/O 操作（数据库、文件、网络）是否使用异步方法（`async/await`）
- [ ] 异步方法是否正确返回 `Task` 或 `Task<T>`（绝不使用 `async void`，除非是事件处理器）
- [ ] 异步方法命名是否以 `Async` 结尾
- [ ] 调用异步方法是否使用 `await` 关键字

#### 避免同步阻塞
- [ ] **严禁**使用 `.Result` 或 `.GetAwaiter().GetResult()` 同步等待异步结果
- [ ] **严禁**使用 `.Wait()` 阻塞异步任务
- [ ] **严禁**在异步方法中使用阻塞式同步调用（如 `Thread.Sleep()`，应使用 `await Task.Delay()`）
- [ ] 是否避免混合使用同步和异步代码导致死锁

#### 异步最佳实践
- [ ] 是否使用 `ConfigureAwait(false)` 避免不必要的上下文捕获（库代码中）
- [ ] 是否避免在循环中频繁 `await`（考虑使用 `Task.WhenAll` 并行处理）
- [ ] 长时间运行的任务是否使用 `Task.Run` 或后台作业（HangFire）
- [ ] 是否正确处理异步方法的异常（使用 `try-catch` 包裹 `await`）
- [ ] 异步流是否使用 `IAsyncEnumerable<T>` 和 `await foreach`

#### 数据库异步操作
- [ ] EF Core 查询是否使用 `ToListAsync()`、`FirstOrDefaultAsync()`、`AnyAsync()` 等异步方法
- [ ] EF Core 保存是否使用 `SaveChangesAsync()`
- [ ] 仓储方法是否全部异步化
- [ ] **严禁**在异步方法中使用同步 LINQ 方法（如 `.ToList()`、`.First()`）

#### 异步并发控制
- [ ] 并发异步操作是否使用 `SemaphoreSlim` 而非 `lock`
- [ ] 多个独立异步任务是否使用 `Task.WhenAll` 并行执行
- [ ] 是否避免过度并行导致资源耗尽（控制并发度）

#### 异步取消
- [ ] 长时间运行的异步操作是否支持 `CancellationToken`
- [ ] 控制器方法是否接受 `CancellationToken` 参数
- [ ] 异步操作是否正确响应取消请求

### 资源管理
- [ ] `IDisposable` 对象是否正确释放（`using` 语句或 `await using`）
- [ ] 是否避免内存泄漏（事件订阅、大对象等）
- [ ] 大数据处理是否使用流式处理

---

## 6. 安全审查

### 输入验证
- [ ] 所有外部输入是否经过验证和清理
- [ ] 是否防止 SQL 注入（使用参数化查询）
- [ ] 是否防止 XSS 攻击（输出编码）
- [ ] 是否防止 CSRF 攻击
- [ ] 文件上传是否验证类型和大小

### 敏感数据
- [ ] 密码、密钥是否加密存储
- [ ] 日志中是否避免记录敏感信息
- [ ] API 响应是否避免泄露敏感数据
- [ ] 是否正确使用 HTTPS

### 授权检查
- [ ] 所有 API 端点是否有正确的权限控制
- [ ] 是否防止越权访问（横向/纵向）
- [ ] 是否验证用户身份和租户隔离

---

## 7. 错误处理审查

- [ ] 是否捕获特定异常而非 `catch (Exception)`
- [ ] 异常是否正确记录到日志
- [ ] 用户友好的错误消息是否使用 `UserFriendlyException`
- [ ] 是否避免吞没异常
- [ ] 是否正确使用 `finally` 或 `using` 清理资源
- [ ] 异常是否包含足够的上下文信息

---

## 8. 其他审查项

### 兼容性
- [ ] 是否破坏现有 API 契约
- [ ] 数据库迁移是否向后兼容
- [ ] 是否考虑多版本部署场景

### 可维护性
- [ ] 代码是否易于理解和修改
- [ ] 是否避免重复代码（DRY 原则）
- [ ] 是否正确使用设计模式
- [ ] 配置是否易于调整

### 日志记录
- [ ] 关键操作是否记录日志
- [ ] 日志级别是否合理（Debug/Info/Warning/Error）
- [ ] 是否避免日志洪水
- [ ] 日志信息是否包含必要的上下文

### 文档
- [ ] README 是否更新
- [ ] API 变更是否记录
- [ ] 数据库变更是否记录

---

## 参考资料

- [ABP Framework 官方文档](https://docs.abp.io/)
- [C# 编码规范](https://docs.microsoft.com/zh-cn/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- [领域驱动设计模式](https://docs.abp.io/en/abp/latest/Domain-Driven-Design)
