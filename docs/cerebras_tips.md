# Cerebras API での JSON Schema 対応：試行錯誤から学んだノウハウ

## はじめに

Cerebras AI の Structured Output API を使用して JSON Schema を扱う際に遭遇した一連の互換性問題と、その解決策をまとめました。このノウハウは、Cerebras API を使用する際の参考になるはずです。

## 遭遇した問題と解決策

### 1. `definitions` → `$defs` への変更

**エラー**: `400 'definitions' is not supported in JSON schema. Use '$defs' instead`

**解決策**:

```typescript
const jsonSchema = zodToJsonSchema(schema, {
  definitionPath: "$defs", // 'definitions' ではなく '$defs' を使用
  // ...
});
```

### 2. Type Arrays の非サポート

**エラー**: `400 Lists of types are not supported in JSON schema. If you are trying to make a field Optional, use anyOf with a null type`

**解決策**:

```typescript
// 変換前: {"type": ["string", "null"]}
// 変換後: {"anyOf": [{"type": "string"}, {"type": "null"}]}

function transformForCerebrasCompatibility(schema: JsonSchemaNode) {
  if (result.type && Array.isArray(result.type)) {
    const types = result.type as string[];
    delete result.type;
    result.anyOf = types.map((type: string) => ({ type }));
  }
}
```

### 3. additionalProperties の必須化

**エラー**: `400 additionalProperties must be set to false for all objects in JSON schema`

**解決策**:

```typescript
// 全てのオブジェクトに additionalProperties: false を追加
if (result.type === "object" || result.properties) {
  result.additionalProperties = false;
}
```

### 4. nullable フィールドの非サポート

**エラー**: `400 Unsupported JSON schema fields: {'nullable'}`

**解決策**:

```typescript
// nullable: true を anyOf パターンに変換
if (
  result.nullable === true &&
  result.type &&
  typeof result.type === "string"
) {
  const originalType = result.type;
  delete result.type;
  delete result.nullable;
  result.anyOf = [{ type: originalType }, { type: "null" }];
}
```

### 5. minimum/maximum フィールドの非サポート

**エラー**: `400 Unsupported JSON schema fields: {'minimum', 'maximum'}`

**解決策**:

```typescript
// サポートされていないフィールドを削除
delete result.minimum;
delete result.maximum;
```

### 6. Array の items プロパティ必須

**エラー**: `400 Array fields require at least one of 'items' or 'prefixItems'.`

**解決策**:

```typescript
// items が存在しない配列には空オブジェクトを追加
if (result.type === "array" && !result.items && !result.prefixItems) {
  result.items = {};
}
```

### 7. LLM の予期しないレスポンス形式への対応

**問題**: LLMが `dialogues` フィールドに文字列（例: "No dialogue"）を返すケース

**解決策**: より柔軟なスキーマ定義

```typescript
dialogues: z
  .union([
    z.array(z.object({ speaker: z.string(), text: z.string() })),
    z.null(),
    z.string() // 文字列レスポンスも許可
  ])
  .optional()
  .transform((val) => {
    if (val === null || typeof val === 'string') {
      return undefined // 文字列や null は undefined に変換
    }
    return val
  }),
```

## 統合された変換ファンション

これらの問題を一括で解決する変換関数：

```typescript
interface JsonSchemaNode {
  type?: string | string[];
  anyOf?: JsonSchemaNode[];
  properties?: Record<string, JsonSchemaNode>;
  additionalProperties?: boolean;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaNode;
  prefixItems?: JsonSchemaNode[];
  [key: string]: unknown;
}

function transformForCerebrasCompatibility(
  schema: JsonSchemaNode | undefined,
): JsonSchemaNode | undefined {
  if (!schema || typeof schema !== "object" || schema === null) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map((item) =>
      transformForCerebrasCompatibility(item as JsonSchemaNode),
    ) as unknown as JsonSchemaNode;
  }

  const result = { ...schema } as JsonSchemaNode;

  // 1. Type arrays を anyOf に変換
  if (result.type && Array.isArray(result.type)) {
    const types = result.type as string[];
    delete result.type;
    result.anyOf = types.map((type: string) => ({ type }));
  }

  // 2. Nullable arrays を処理
  if (result.nullable === true && result.type === "array") {
    delete result.nullable;
    delete result.type;
    const arraySchema = { type: "array", items: result.items || {} };
    result.anyOf = [arraySchema, { type: "null" }];
    delete result.items;
  }
  // 3. その他の nullable フィールドを処理
  else if (
    result.nullable === true &&
    result.type &&
    typeof result.type === "string"
  ) {
    const originalType = result.type;
    delete result.type;
    delete result.nullable;
    result.anyOf = [{ type: originalType }, { type: "null" }];
  } else if (result.nullable === true) {
    delete result.nullable;
  }

  // 4. additionalProperties を追加
  if (result.type === "object" || result.properties) {
    result.additionalProperties = false;
  }

  // 5. サポートされていないフィールドを削除
  delete result.minimum;
  delete result.maximum;

  // 6. Array の items を保証
  if (result.type === "array" && !result.items && !result.prefixItems) {
    result.items = {};
  }

  // 7. 再帰的に処理
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          transformForCerebrasCompatibility(item as JsonSchemaNode),
        );
      } else {
        result[key] = transformForCerebrasCompatibility(
          value as JsonSchemaNode,
        );
      }
    }
  }

  return result;
}
```

## Zod との統合

`zod-to-json-schema` との組み合わせ例：

```typescript
const jsonSchema = zodToJsonSchema(schema, {
  name: "response_schema",
  definitionPath: "$defs",
  strictUnions: true,
  target: "openApi3",
  removeAdditionalStrategy: "strict",
  postProcess: (schema) => {
    return transformForCerebrasCompatibility(
      schema as JsonSchemaNode,
    ) as typeof schema;
  },
});
```

## まとめ

Cerebras API の JSON Schema 対応は、標準的な JSON Schema 仕様とは異なる独自の制約があります：

- `definitions` の代わりに `$defs` を使用
- Type arrays は `anyOf` パターンで表現
- 全オブジェクトに `additionalProperties: false` が必要
- `nullable`, `minimum`, `maximum` フィールドは非サポート
- 配列には必ず `items` または `prefixItems` が必要
- LLM のレスポンス形式が予測困難な場合がある

これらの制約を理解し、適切な変換処理を行うことで、Cerebras API でも安定した Structured Output を実現できます。

## 参考リンク

- [Cerebras API Documentation](https://inference-docs.cerebras.ai/)
- [JSON Schema Specification](https://json-schema.org/)
- [zod-to-json-schema](https://github.com/StefanTerdell/zod-to-json-schema)
