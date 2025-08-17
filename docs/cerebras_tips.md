# Cerebras API での JSON Schema 対応：試行錯誤から学んだノウハウ

## はじめに

Cerebras AI の Structured Output API を使用して JSON Schema を扱う際に遭遇した一連の互換性問題と、その解決策をまとめました。このノウハウは、Cerebras API を使用する際の参考になるはずです。

## 遭遇した問題と解決策

### 1. `definitions` → `$defs` への変更

**エラー**: `400 'definitions' is not supported in JSON schema. Use '$defs' instead`

**解決策**:

```typescript
const jsonSchema = zodToJsonSchema(schema, {
  definitionPath: '$defs', // 'definitions' ではなく '$defs' を使用
  // ...
})
```

### 2. Type Arrays の非サポート

**エラー**: `400 Lists of types are not supported in JSON schema. If you are trying to make a field Optional, use anyOf with a null type`

**解決策**:

```typescript
// 変換前: {"type": ["string", "null"]}
// 変換後: {"anyOf": [{"type": "string"}, {"type": "null"}]}

function transformForCerebrasCompatibility(schema: JsonSchemaNode) {
  if (result.type && Array.isArray(result.type)) {
    const types = result.type as string[]
    delete result.type
    result.anyOf = types.map((type: string) => ({ type }))
  }
}
```

### 3. additionalProperties の必須化

**エラー**: `400 additionalProperties must be set to false for all objects in JSON schema`

**解決策**:

```typescript
// 全てのオブジェクトに additionalProperties: false を追加
if (result.type === 'object' || result.properties) {
  result.additionalProperties = false
}
```

### 4. nullable フィールドの非サポート

**エラー**: `400 Unsupported JSON schema fields: {'nullable'}`

**解決策**:

```typescript
// nullable: true を anyOf パターンに変換
if (result.nullable === true && result.type && typeof result.type === 'string') {
  const originalType = result.type
  delete result.type
  delete result.nullable
  result.anyOf = [{ type: originalType }, { type: 'null' }]
}
```

### 5. minimum/maximum フィールドの非サポート

**エラー**: `400 Unsupported JSON schema fields: {'minimum', 'maximum'}`

**解決策**:

```typescript
// サポートされていないフィールドを削除
delete result.minimum
delete result.maximum
```

### 6. Array の items プロパティ必須

**エラー**: `400 Array fields require at least one of 'items' or 'prefixItems'.`

**解決策**:

```typescript
// items が存在しない配列には空オブジェクトを追加
if (result.type === 'array' && !result.items && !result.prefixItems) {
  result.items = {}
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

## 統合された変換関数

これらの問題を一括で解決する変換関数：

```typescript
interface JsonSchemaNode {
  type?: string | string[]
  anyOf?: JsonSchemaNode[]
  properties?: Record<string, JsonSchemaNode>
  additionalProperties?: boolean
  nullable?: boolean
  minimum?: number
  maximum?: number
  items?: JsonSchemaNode
  prefixItems?: JsonSchemaNode[]
  [key: string]: unknown
}

function transformForCerebrasCompatibility(
  schema: JsonSchemaNode | undefined,
): JsonSchemaNode | undefined {
  if (!schema || typeof schema !== 'object' || schema === null) {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map((item) =>
      transformForCerebrasCompatibility(item as JsonSchemaNode),
    ) as unknown as JsonSchemaNode
  }

  const result = { ...schema } as JsonSchemaNode

  // 1. Type arrays を anyOf に変換
  if (result.type && Array.isArray(result.type)) {
    const types = result.type as string[]
    delete result.type
    result.anyOf = types.map((type: string) => ({ type }))
  }

  // 2. Nullable arrays を処理
  if (result.nullable === true && result.type === 'array') {
    delete result.nullable
    delete result.type
    const arraySchema = { type: 'array', items: result.items || {} }
    result.anyOf = [arraySchema, { type: 'null' }]
    delete result.items
  }
  // 3. その他の nullable フィールドを処理
  else if (result.nullable === true && result.type && typeof result.type === 'string') {
    const originalType = result.type
    delete result.type
    delete result.nullable
    result.anyOf = [{ type: originalType }, { type: 'null' }]
  } else if (result.nullable === true) {
    delete result.nullable
  }

  // 4. additionalProperties を追加
  if (result.type === 'object' || result.properties) {
    result.additionalProperties = false
  }

  // 5. サポートされていないフィールドを削除
  delete result.minimum
  delete result.maximum

  // 6. Array の items を保証
  if (result.type === 'array' && !result.items && !result.prefixItems) {
    result.items = {}
  }

  // 7. 再帰的に処理
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) => transformForCerebrasCompatibility(item as JsonSchemaNode))
      } else {
        result[key] = transformForCerebrasCompatibility(value as JsonSchemaNode)
      }
    }
  }

  return result
}
```

## Zod との統合

`zod-to-json-schema` との組み合わせ例：

```typescript
const jsonSchema = zodToJsonSchema(schema, {
  name: 'response_schema',
  definitionPath: '$defs',
  strictUnions: true,
  target: 'openApi3',
  removeAdditionalStrategy: 'strict',
  postProcess: (schema) => {
    return transformForCerebrasCompatibility(schema as JsonSchemaNode) as typeof schema
  },
})
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

# cerebras documentation about structured outputs

# Structured Outputs

> Generate structured data with the Cerebras Inference API

<Tip>
  [**To get started with a free API key, click here.**](https://cloud.cerebras.ai?utm_source=inferencedocs)
</Tip>

<Warning>
  Structured outputs with strict adherence is currently in beta, released in version 1.23 of the Cerebras Inference Cloud SDK. Improvements for speed and expanded support will be released in coming weeks, with documentation updated accordingly.
</Warning>

Structured outputs is a feature that can enforce consistent JSON outputs for models in the Cerebras Inference API. This is particularly useful when building applications that need to process AI-generated data programmatically. Some of the key benefits of using structured outputs are:

- **Reduced Variability**: Ensures consistent outputs by adhering to predefined fields.
- **Type Safety**: Enforces correct data types, preventing mismatches.
- **Easier Parsing & Integration**: Enables direct use in applications without extra processing.

## Tutorial: Structured Outputs using Cerebras Inference

In this tutorial, we'll explore how to use structured outputs with the Cerebras Cloud SDK. We'll build a simple application that generates movie recommendations and uses structured outputs to ensure the response is in a consistent JSON format.

<Steps>
  <Step title="Initial Setup">
    First, ensure that you have completed steps 1 and 2 of our [Quickstart Guide](/quickstart) to set up your API key and install the Cerebras Cloud SDK.

    Then, initialize the Cerebras client and import the necessary modules we will use in this tutorial.

    <CodeGroup>
      ```python Python
      import os
      from cerebras.cloud.sdk import Cerebras
      import json

      client = Cerebras(
          api_key=os.environ.get("CEREBRAS_API_KEY")
      )
      ```

      ```javascript Node.js
      import Cerebras from '@cerebras/cerebras_cloud_sdk';

      const client = new Cerebras({
        apiKey: process.env['CEREBRAS_API_KEY']
      });
      ```
    </CodeGroup>

  </Step>

  <Step title="Defining the Schema">
    To ensure structured responses from the model, we'll use a JSON schema to define our output structure. Start by defining your schema, which specifies the fields, their types, and which ones are required. For our example, we'll define a schema for a movie recommendation that includes the title, director, and year:

    <Warning>
      Note: For every `required` array you define in your schema, you must set `additionalProperties` to `false`.
    </Warning>

    <CodeGroup>
      ```python Python
      movie_schema = {
          "type": "object",
          "properties": {
              "title": {"type": "string"},
              "director": {"type": "string"},
              "year": {"type": "integer"},
          },
          "required": ["title", "director", "year"],
          "additionalProperties": False
      }
      ```

      ```javascript Node.js
      const movieSchema = {
          type: "object",
          properties: {
              title: { type: "string" },
              director: { type: "string" },
              year: { type: "integer" },
          },
          required: ["title", "director", "year"],
          additionalProperties: false
      };
      ```
    </CodeGroup>

  </Step>

  <Step title="Using Structured Outputs">
    Next, use the schema in your API call by setting the `response_format` parameter to include both the type and your schema. Setting `strict` to `true` will enforce the schema. Setting `strict` to `false` will allow the model to return additional fields that are not specified in the schema, similar to [JSON mode](#json-mode).

    <CodeGroup>
      ```python Python
      completion = client.chat.completions.create(
          model="llama-4-scout-17b-16e-instruct",
          messages=[
              {"role": "system", "content": "You are a helpful assistant that generates movie recommendations."},
              {"role": "user", "content": "Suggest a sci-fi movie from the 1990s"}
          ],
          response_format={
              "type": "json_schema",
              "json_schema": {
                  "name": "movie_schema",
                  "strict": True,
                  "schema": movie_schema
              }
          }
      )

      # Parse the JSON response
      movie_data = json.loads(completion.choices[0].message.content)
      print(json.dumps(movie_data, indent=2))
      ```

      ```javascript Node.js
      async function main() {
        const schemaCompletion = await client.chat.completions.create({
          model: 'llama-4-scout-17b-16e-instruct',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that generates movie recommendations.' },
            { role: 'user', content: 'Suggest a sci-fi movie from the 1990s' }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'movie_schema',
              strict: true,
              schema: movieSchema
            }
          }
        });

        // Parse and display the JSON response
        const schemaMovieData = JSON.parse(schemaCompletion.choices[0].message.content);
        console.log('Movie Recommendation:');
        console.log(JSON.stringify(schemaMovieData, null, 2));
      }
      ```
    </CodeGroup>

    Sample output:

    ```
    {
      "title": "The Fifth Element",
      "director": "Luc Besson",
      "year": 1997
    }
    ```

    Now you have a structured JSON response from the model, which can be used in your application.

  </Step>
</Steps>

## Schema References and Definitions

You can use `$ref` with `$defs` to define reusable schema components within your JSON schema. This is useful for avoiding repetition and creating more maintainable schemas.

```python highlight={5,7-8}
schema_with_defs = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "director": {"$ref": "#/$defs/person"},
        "year": {"type": "integer"},
        "lead_actor": {"$ref": "#/$defs/person"},
        "studio": {"$ref": "#/$defs/studio"}
    },
    "required": ["title", "director", "year"],
    "additionalProperties": False,
    "$defs": {
        "person": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer"}
            },
            "required": ["name"],
            "additionalProperties": False
        },
        "studio": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "founded": {"type": "integer"},
                "headquarters": {"type": "string"}
            },
            "required": ["name"],
            "additionalProperties": False
        }
    }
}
```

## Advanced Schema Features

Your schema can include various JSON Schema features:

- **Fundamental Data Types**: String, Number, Boolean, Integer, Object, Array, Enum, null.
- **Union Types**: Use `anyOf` to allow the model to return one of multiple possible types (max of 5). Note: The shorthand `"type": [ … ]` is not supported. See [schema limitations](#schema-limitations) for an example.
- **Nested structures**: Define complex objects with nested properties, with support for up to 5 layers of nesting. You can also use definitions to reference reusable schema components.
- **Required fields**: Specify which fields must be present.
- **Additional properties**: Control whether extra fields are allowed. Note: the only accepted value is `false`. For every `required` array you define in your schema, you must set `additionalProperties` to `false`.
- **Enums (value constraints)**: Use the `enum` keyword to whitelist the exact literals a field may take. See `rating` in the example below.

For example, a more complex schema might look like:

```python
detailed_schema = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "director": {"type": "string"},
        "year": {"type": "integer"},
        "genres": {
            "type": "array",
            "items": {"type": "string"}
        },
        "rating": {
            "type": "string",
            "enum": ["G", "PG", "PG‑13", "R"]
        },
        "cast": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "role": {"type": "string"}
                },
                "required": ["name"],
                "additionalProperties": False
            }
        }
    },
    "required": ["title", "director", "year", "genres"],
    "additionalProperties": False
}
```

When used with the API, you might get a response like:

```json
{
  "title": "Jurassic Park",
  "director": "Steven Spielberg",
  "year": 1993,
  "genres": ["Science Fiction", "Adventure", "Thriller"],
  "cast": [
    { "name": "Sam Neill", "role": "Dr. Alan Grant" },
    { "name": "Laura Dern", "role": "Dr. Ellie Sattler" },
    { "name": "Jeff Goldblum", "role": "Dr. Ian Malcolm" }
  ]
}
```

## Working with Pydantic and Zod

Besides defining a JSON schema manually, you can use Pydantic (Python) or Zod (JavaScript) to create your schema and convert it to JSON. Pydantic's `model_json_schema` and Zod's `zodToJsonSchema` methods generate the JSON schema, which can then be used in the API call, as demonstrated in the workflow above.

<CodeGroup>
  ```python Python (Pydantic)
  from pydantic import BaseModel
  import json

# Define your schema using Pydantic

class Movie(BaseModel):
title: str
director: str
year: int

# Convert the Pydantic model to a JSON schema

movie_schema = Movie.model_json_schema()

# Print the JSON schema to verify it

print(json.dumps(movie_schema, indent=2))

````

```javascript Node.js (Zod)
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Define your schema using Zod
const MovieSchema = z.object({
  title: z.string(),
  director: z.string(),
  year: z.number().int()
});

// Convert the Zod schema to a JSON schema
const movieJsonSchema = zodToJsonSchema(MovieSchema, { name: 'movie_schema' });

// Print the JSON schema to verify it
console.log(JSON.stringify(movieJsonSchema, null, 2));
````

</CodeGroup>

## JSON Mode

In addition to structured outputs, you can also use JSON mode to generate JSON responses from the model. This approach tells the model to return data in JSON format but doesn't enforce a specific structure. The model decides what fields to include based on the context of your prompt.

<Note>
  We recommend using structured outputs (with strict set to true) whenever possible, as it provides more predictable and reliable results.
</Note>

To use JSON mode, simply set the `response_format` parameter to `json_object`:

<CodeGroup>
  ```python Python
  completion = client.chat.completions.create(
      model="llama-4-scout-17b-16e-instruct",
      messages=[
        {"role": "system", "content": "You are a helpful assistant that generates movie recommendations."},
        {"role": "user", "content": "Suggest a sci-fi movie from the 1990s"}
      ],
      response_format={"type": "json_object"}
  )
  ```

```javascript Node.js
async function main() {
  const jsonModeCompletion = await client.chat.completions.create({
    model: 'llama-4-scout-17b-16e-instruct',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates movie recommendations.',
      },
      { role: 'user', content: 'Suggest a sci-fi movie from the 1990s' },
    ],
    response_format: {
      type: 'json_object',
    },
  })
}
```

</CodeGroup>

### Structured Outputs vs JSON Mode

The table below summarizes the key differences between Structured Outputs and JSON Mode:

| Feature            | Structured Output                                                                        | JSON Mode                                  |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| Outputs valid JSON | Yes                                                                                      | Yes                                        |
| Adheres to schema  | Yes (enforced)                                                                           | No (flexible)                              |
| Enabling           | `response_format: { type: "json_schema", json_schema: {"strict": true, "schema": ...} }` | `response_format: { type: "json_object" }` |

## Variations from OpenAI's Structured Output Capabilities

While our structured output capabilities closely match OpenAI's implementation, there are a few key differences to note.

<Note>
  These limitations only apply if `strict` is set to `true` in the JSON schema.
</Note>

<Accordion title="Schema Limitations">
  * Recursive JSON schemas are not currently supported.
  * Maximum schema length is limited to 5,000 characters.
  * No error is thrown when `additionalProperties` is not explicitly set to false. We quietly handle this case.
  * Union shorthand `"type": ["string", "null"]` is not supported. Use `anyOf` instead, and remember that all properties must be listed in the `required` array. See the example below.

```json
{
  "type": "object",
  "properties": {
    "recordId": {
      "anyOf": [{ "type": "string" }, { "type": "null" }]
    }
  },
  "required": ["recordId"],
  "additionalProperties": false
}
```

</Accordion>

<Accordion title="Property Handling">
  * Every property defined in `properties` must also appear in the `required` array.  If a property may be `null`, keep it in `required` and add a union with `anyOf`.
  * Omitted optional properties are not treated as errors.
</Accordion>

<Accordion title="Array Validation">
  * `items: true` is not supported for JSON schema array types.
  * `items: false` is supported when used with `prefixItems` for tuple-like arrays with validation rules.
</Accordion>

<Accordion title="Schema Structure">
  * `$anchor` keyword is not supported - use relative paths within definitions/references instead.
  * Use `$defs` instead of `definitions` for reusable schema components.
  * Additional informational fields meant as guidelines (not used in validation) are not supported.
</Accordion>

<Accordion title="Supported Reference Patterns">
  <Danger>
    For security reasons, external schema references are not supported.
  </Danger>

- Internal definitions are supported: `"$ref": "#/$defs/cast_member"`
- Other reference access patterns are not recommended, and will be deprecated in future releases. See [Schema References and Definitions](#schema-references-and-definitions) for more info.
  </Accordion>

<Warning>
  Structured outputs do not work with function calling yet. This feature will be supported in a future release.
</Warning>

## Conclusion

Structured outputs with JSON schema enforcement ensures your AI-generated responses follow a consistent, predictable format. This makes it easier to build reliable applications that can process AI outputs programmatically without worrying about unexpected data structures or missing fields.

Check out some of our other tutorials to learn more about other features of the Cerebras Inference SDK:

- [CePO](/capabilities/cepo): a reasoning framework for improving Llama’s reasoning abilities with test-time compute
- [Tool Use](/capabilities/tool-use): extending models' capabilities to access tools to answer questions and perform actions
- [Streaming](/capabilities/streaming): a feature for streaming responses from the model
