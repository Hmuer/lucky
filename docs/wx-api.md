# 微信小程序 API 契约

Base URL：`https://lucky.ls-lh.cn/api/wx`（本地为 `http://127.0.0.1:3000/api/wx`）

所有接口返回 JSON。成功统一为：

```json
{ "code": 0, "data": {} }
```

业务失败：

```json
{ "code": 40001, "message": "参数错误" }
```

鉴权失败（HTTP 401）：

```json
{ "code": 40100, "message": "未登录" }
```

## 鉴权

除 `POST /login` 外，所有接口需要：

```http
Authorization: Bearer <token>
```

token 由登录接口签发，有效期 30 天，payload 含 `uid`。

## 金额单位（重要）

- **分**：守号单注金额 `unitPrice`、核对 `cost` / `winAmount` / `profit`、统计 `cost` / `winAmount` / `profit` / `bestWin`。
- **元**：开奖 `sales`（销售额）、`poolmoney`（奖池）、`firstPrize.amount`、`secondPrize.amount`（官方公告金额）。
- `tierCounts` 是命中注数，不是金额。

## 错误码

| code | 含义 | HTTP |
|---|---|---|
| 0 | 成功 | 200 |
| 40001 | 参数/号码校验失败 | 200 |
| 40100 | 未登录、token 无效或过期 | 401 |
| 40101 | 微信登录失败 | 200 |
| 40401 | 守号不存在或不属于当前用户 | 200 |
| 50001 | 服务端/同步失败 | 200 |

---

## 1. 登录

`POST /login`

Request:

```json
{ "code": "wx.login 返回的 code" }
```

Success:

```json
{
  "code": 0,
  "data": {
    "token": "eyJ...",
    "isNew": true
  }
}
```

失败：

```json
{ "code": 40101, "message": "登录失败" }
```

服务端用 code 调用微信 `jscode2session`，首次登录自动创建 `users` 记录。

---

## 2. 订阅配置

`GET /subscribe-config`

```json
{ "code": 0, "data": { "templateId": "模板 ID" } }
```

小程序拿到后调用 `wx.requestSubscribeMessage({ tmplIds: [templateId] })`。

---

## 3. 上报订阅授权

`POST /report-subscription`

```json
{ "accepted": true }
```

```json
{ "code": 0, "data": { "accepted": true } }
```

每次用户完成 `requestSubscribeMessage` 后调用；`accepted=false` 表示不同意，后续不推送。

---

## 4. 最近一期 + 当期核对

`GET /current`

```json
{
  "code": 0,
  "data": {
    "draw": {
      "code": "2026120",
      "date": "2026-10-20",
      "week": "二",
      "red": [13, 14, 16, 18, 20, 31],
      "blue": 3,
      "sales": 364378528,
      "poolmoney": 1025112736,
      "firstPrize": { "count": 2, "amount": 10000000 },
      "secondPrize": { "count": 61, "amount": 472442 }
    },
    "hits": [
      {
        "betId": 1,
        "name": "1",
        "type": "complex",
        "units": 16,
        "cost": 3200,
        "tierCounts": { "6": 1 },
        "winAmount": 500,
        "profit": -2700
      }
    ],
    "summary": { "cost": 3200, "winAmount": 500, "profit": -2700 }
  }
}
```

- `hits` 只包含当前用户、当前期的核对。
- 无开奖数据时 `draw=null`、`hits=[]`、`summary` 全 0。
- `tierCounts` 的 key 是 1~6 等奖，value 是命中注数。

---

## 5. 守号列表

`GET /bets`

```json
{
  "code": 0,
  "data": {
    "bets": [
      {
        "id": 1,
        "name": "1",
        "type": "complex",
        "payload": { "red": [3, 4, 6, 8, 19, 27], "blue": [1, 2] },
        "unitPrice": 200,
        "buyEnabled": true,
        "active": true,
        "startCode": "2026002",
        "createdAt": 1788515945199,
        "updatedAt": 1788515945199
      }
    ],
    "nextDrawCode": "2026121"
  }
}
```

`type`：

- `single`：`payload = { red: [6 个], blue: [1 个] }`
- `complex`：`payload = { red: [6~20 个], blue: [1~16 个] }`
- `danTuo`：`payload = { redDan: [1~5 个], redTuo: [...], blue: [1~16 个] }`

---

## 6. 新增守号

`POST /bets`

沿用网页端字段：

```json
{
  "name": "我的复式",
  "type": "complex",
  "payload": { "red": [1, 2, 3, 4, 5, 6], "blue": [1, 2] },
  "unit_price": 200,
  "buy_enabled": true,
  "active": true,
  "start_code_mode": "next",
  "start_code": null
}
```

- `unit_price`：分，最小 100，默认 200。
- `buy_enabled`：每期是否购买，默认 true。
- `active`：启用状态，默认 true。
- `start_code_mode`：
  - `all`：从所有已入库期开始结算；
  - `next`：从下一期开始（默认）；
  - `custom`：使用传入的 `start_code`。
- `start_code`：7 位期号，如 `2026121`。

Success:

```json
{
  "code": 0,
  "data": {
    "id": 2,
    "resync": { "recalc": 0, "deleted": 0 }
  }
}
```

---

## 7. 修改守号

`PUT /bets/:id`

Body 可只传要改的字段；`payload` 变更时必须带 `type`：

```json
{
  "name": "新名字",
  "type": "complex",
  "payload": { "red": [1, 2, 3, 4, 5, 6], "blue": [1] },
  "unit_price": 200,
  "buy_enabled": true,
  "active": true,
  "start_code": "2026121"
}
```

Success:

```json
{ "code": 0, "data": { "ok": true, "resync": { "recalc": 0, "deleted": 0 } } }
```

只能修改自己的守号，否则返回 `40401`。

---

## 8. 删除守号

`DELETE /bets/:id`

```json
{ "code": 0, "data": { "ok": true } }
```

只能删除自己的守号，否则返回 `40401`。

---

## 9. 历史核对

`GET /history`

按期号倒序：

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "draw": {
          "code": "2026120",
          "date": "2026-10-20",
          "week": "二",
          "red": [13, 14, 16, 18, 20, 31],
          "blue": 3
        },
        "hits": [
          {
            "betId": 1,
            "name": "1",
            "type": "complex",
            "units": 16,
            "cost": 3200,
            "tierCounts": { "6": 1 },
            "winAmount": 500,
            "profit": -2700
          }
        ],
        "summary": { "cost": 3200, "winAmount": 500, "profit": -2700 }
      }
    ]
  }
}
```

---

## 10. 中奖统计

`GET /stats`

```json
{
  "code": 0,
  "data": {
    "summary": {
      "periods": 119,
      "winsCount": 119,
      "cost": 380800,
      "winAmount": 96000,
      "profit": -284800,
      "tierCounts": { "1": 0, "2": 0, "3": 0, "4": 1, "5": 19, "6": 114 }
    },
    "bets": [
      {
        "betId": 1,
        "name": "1",
        "type": "complex",
        "periods": 119,
        "winsCount": 119,
        "cost": 380800,
        "winAmount": 96000,
        "profit": -284800,
        "bestWin": 35000,
        "tierCounts": { "1": 0, "2": 0, "3": 0, "4": 1, "5": 19, "6": 114 }
      }
    ]
  }
}
```

- `periods`：参与核对的期数。
- `winsCount`：中过奖的期数（含六等奖）。
- `bestWin`：单期最高奖金（分）。
- `summary.periods/winsCount` 为各守号求和。

---

## 11. 触发同步

`POST /sync`

小程序调用需 Bearer token；外部定时器调用需要：

```http
x-cron-secret: <CRON_SECRET>
```

Success:

```json
{
  "code": 0,
  "data": {
    "fetched": 2078,
    "saved": 0,
    "hits": 0,
    "errors": [],
    "skipped": true,
    "newDraws": [],
    "pushed": 0
  }
}
```

- 无新期时 `saved=0`、`skipped=true`，不会写库。
- 有新期时 `newDraws` 为新增期号，`pushed` 为成功推送人数。
- 一次补多期时只对最新一期推送，避免连续轰炸用户。
- 同步失败 `{ "code": 50001, "message": "..." }`。
