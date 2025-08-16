# Dependency Chart

````mermaid
flowchart LR

subgraph n0["src"]
subgraph n1["agents"]
n2["agent.ts"]
n7["errors.ts"]
n8["base-agent.ts"]
n9["chunk-analyzer.ts"]
```mermaid
flowchart LR

subgraph n0["src"]
subgraph n1["agents"]
n2["agent.ts"]
n7["errors.ts"]
n8["base-agent.ts"]
n9["chunk-analyzer.ts"]
D["chunk-bundle-analyzer.ts"]
E["layout-generator.ts"]
subgraph O["layout"]
P["input-adapter.ts"]
end
Q["narrative-arc-analyzer.ts"]
S["page-splitter.ts"]
subgraph T["scenarios"]
U["novel-to-manga.ts"]
end
end
subgraph n10["app"]
subgraph n11["api"]
subgraph n12["abtest"]
subgraph n13["analyze"]
n14["route.ts"]
subgraph n10["app"]
subgraph n11["api"]
subgraph n12["abtest"]
subgraph n13["analyze"]
n14["route.ts"]
end
end
subgraph n15["analyze"]
subgraph n16["chunk"]
n17["route.ts"]
subgraph n15["analyze"]
subgraph n16["chunk"]
n17["route.ts"]
end
subgraph n1C["narrative-arc"]
subgraph n1D["full"]
n1E["route.ts"]
subgraph n1C["narrative-arc"]
subgraph n1D["full"]
n1E["route.ts"]
end
n1N["route.ts"]
n1N["route.ts"]
end
n1T["route.ts"]
n1T["route.ts"]
end
subgraph n1X["docs"]
n1Y["route.ts"]
subgraph n1X["docs"]
n1Y["route.ts"]
end
subgraph n22["export"]
n23["route.ts"]
subgraph n25["zip"]
subgraph n26["[jobId]"]
n27["route.ts"]
subgraph n22["export"]
n23["route.ts"]
subgraph n25["zip"]
subgraph n26["[jobId]"]
n27["route.ts"]
end
end
end
subgraph n28["health"]
n29["route.ts"]
subgraph n28["health"]
n29["route.ts"]
end
subgraph n2A["job"]
subgraph n2B["[id]"]
n2C["route.ts"]
subgraph n2A["job"]
subgraph n2B["[id]"]
n2C["route.ts"]
end
end
subgraph n2E["jobs"]
subgraph n2F["[jobId]"]
subgraph n2G["episodes"]
n2H["route.ts"]
subgraph n2E["jobs"]
subgraph n2F["[jobId]"]
subgraph n2G["episodes"]
n2H["route.ts"]
end
subgraph n2J["resume"]
n2K["route.ts"]
subgraph n2J["resume"]
n2K["route.ts"]
end
n2M["route.ts"]
subgraph n2N["status"]
n2O["route.ts"]
n2M["route.ts"]
subgraph n2N["status"]
n2O["route.ts"]
end
subgraph n2P["token-usage"]
n2Q["route.ts"]
subgraph n2P["token-usage"]
n2Q["route.ts"]
end
end
end
subgraph n2R["layout"]
subgraph n2S["generate"]
n2T["route.ts"]
subgraph n2R["layout"]
subgraph n2S["generate"]
n2T["route.ts"]
end
end
subgraph n2X["novel"]
subgraph n2Y["db"]
n2Z["route.ts"]
subgraph n2X["novel"]
subgraph n2Y["db"]
n2Z["route.ts"]
end
n31["route.ts"]
subgraph n32["storage"]
n33["route.ts"]
n31["route.ts"]
subgraph n32["storage"]
n33["route.ts"]
end
end
subgraph n34["render"]
subgraph n35["[episodeNumber]"]
subgraph n36["[pageNumber]"]
n37["route.ts"]
subgraph n34["render"]
subgraph n35["[episodeNumber]"]
subgraph n36["[pageNumber]"]
n37["route.ts"]
end
end
subgraph n38["batch"]
n39["route.ts"]
subgraph n38["batch"]
n39["route.ts"]
end
n3A["route.ts"]
subgraph n3C["status"]
subgraph n3D["[jobId]"]
n3E["route.ts"]
n3A["route.ts"]
subgraph n3C["status"]
subgraph n3D["[jobId]"]
n3E["route.ts"]
end
end
end
subgraph n3F["scenario"]
subgraph n3G["run"]
n3H["route.ts"]
subgraph n3F["scenario"]
subgraph n3G["run"]
n3H["route.ts"]
end
end
subgraph n3K["share"]
n3L["route.ts"]
subgraph n3K["share"]
n3L["route.ts"]
end
end
n3M["error.tsx"]
n3N["layout.tsx"]
n3O["globals.css"]
n3P["loading.tsx"]
n3Q["not-found.tsx"]
subgraph n3R["novel"]
subgraph n3S["[novelId]"]
subgraph n3T["results"]
subgraph n3U["[jobId]"]
subgraph n3V["episode"]
subgraph n3W["[episodeNumber]"]
n3X["page.tsx"]
n3M["error.tsx"]
n3N["layout.tsx"]
n3O["globals.css"]
n3P["loading.tsx"]
n3Q["not-found.tsx"]
subgraph n3R["novel"]
subgraph n3S["[novelId]"]
subgraph n3T["results"]
subgraph n3U["[jobId]"]
subgraph n3V["episode"]
subgraph n3W["[episodeNumber]"]
n3X["page.tsx"]
end
end
end
n3Y["page.tsx"]
n3Y["page.tsx"]
end
end
end
n3Z["page.tsx"]
subgraph n42["scenario"]
n43["page.tsx"]
n3Z["page.tsx"]
subgraph n42["scenario"]
n43["page.tsx"]
end
subgraph n45["test-novel"]
n46["page.tsx"]
subgraph n45["test-novel"]
n46["page.tsx"]
end
end
subgraph n48["components"]
n49["HomeClient.tsx"]
n4D["Logger.tsx"]
n4E["NovelUploader.tsx"]
n4F["ProcessingProgress.tsx"]
n4G["ResultsDisplay.tsx"]
n4H["ScenarioViewer.tsx"]
n4I["TextInputArea.tsx"]
subgraph n48["components"]
n49["HomeClient.tsx"]
n4D["Logger.tsx"]
n4E["NovelUploader.tsx"]
n4F["ProcessingProgress.tsx"]
n4G["ResultsDisplay.tsx"]
n4H["ScenarioViewer.tsx"]
n4I["TextInputArea.tsx"]
end
subgraph n4J["config"]
n4K["app.config.ts"]
n4L["index.ts"]
n4M["llm.config.ts"]
subgraph n4J["config"]
n4K["app.config.ts"]
n4L["index.ts"]
n4M["llm.config.ts"]
end
subgraph n4N["db"]
n4O["index.ts"]
n4P["schema.ts"]
subgraph n4N["db"]
n4O["index.ts"]
n4P["schema.ts"]
end
subgraph n4Q["domain"]
subgraph n4R["models"]
n4S["emotion.ts"]
n4T["page.ts"]
n4U["panel.ts"]
n4V["scene.ts"]
subgraph n4Q["domain"]
subgraph n4R["models"]
n4S["emotion.ts"]
n4T["page.ts"]
n4U["panel.ts"]
n4V["scene.ts"]
end
subgraph n4W["repositories"]
n4X["chunk-repository.ts"]
subgraph n4W["repositories"]
n4X["chunk-repository.ts"]
end
end
subgraph n4Y["errors"]
n4Z["rate-limit-error.ts"]
n50["retryable-error.ts"]
subgraph n4Y["errors"]
n4Z["rate-limit-error.ts"]
n50["retryable-error.ts"]
end
subgraph n51["infrastructure"]
subgraph n52["logging"]
n53["logger.ts"]
subgraph n51["infrastructure"]
subgraph n52["logging"]
n53["logger.ts"]
end
subgraph n54["storage"]
n55["chunk-repository.ts"]
n56["ports.ts"]
subgraph n54["storage"]
n55["chunk-repository.ts"]
n56["ports.ts"]
end
end
subgraph n57["lib"]
subgraph n58["cache"]
n59["kv.ts"]
subgraph n57["lib"]
subgraph n58["cache"]
n59["kv.ts"]
end
subgraph n5A["canvas"]
n5B["canvas-renderer.ts"]
n5C["index.ts"]
n5D["manga-page-renderer.ts"]
n5F["panel-layout-engine.ts"]
n5G["speech-bubble-placer.ts"]
n5H["thumbnail-generator.ts"]
subgraph n5A["canvas"]
n5B["canvas-renderer.ts"]
n5C["index.ts"]
n5D["manga-page-renderer.ts"]
n5F["panel-layout-engine.ts"]
n5G["speech-bubble-placer.ts"]
n5H["thumbnail-generator.ts"]
end
end
subgraph n5I["repositories"]
n5J["adapters.ts"]
n5K["chunk-repository.ts"]
n5L["episode-repository.ts"]
subgraph n5M["ports"]
n5N["index.ts"]
subgraph n5I["repositories"]
n5J["adapters.ts"]
n5K["chunk-repository.ts"]
n5L["episode-repository.ts"]
subgraph n5M["ports"]
n5N["index.ts"]
end
n5O["factory.ts"]
n5P["job-repository.ts"]
n5Q["novel-repository.ts"]
n5R["output-repository.ts"]
n5S["index.ts"]
n5O["factory.ts"]
n5P["job-repository.ts"]
n5Q["novel-repository.ts"]
n5R["output-repository.ts"]
n5S["index.ts"]
end
subgraph n5T["services"]
subgraph n5U["adapters"]
n5V["index.ts"]
subgraph n5T["services"]
subgraph n5U["adapters"]
n5V["index.ts"]
end
n5W["api.ts"]
subgraph n5X["application"]
n5Y["analyze-pipeline.ts"]
n60["episode-write.ts"]
n61["job-details.ts"]
n62["job-progress.ts"]
n63["layout-generation.ts"]
n66["output-service.ts"]
n69["render.ts"]
n5W["api.ts"]
subgraph n5X["application"]
n5Y["analyze-pipeline.ts"]
n60["episode-write.ts"]
n61["job-details.ts"]
n62["job-progress.ts"]
n63["layout-generation.ts"]
n66["output-service.ts"]
n69["render.ts"]
end
n6E["database.ts"]
n6I["db-factory.ts"]
n6J["job-narrative-processor.ts"]
n6M["notifications.ts"]
subgraph n6N["orchestrator"]
n6O["cf-executor.ts"]
n6P["scenario.ts"]
n6E["database.ts"]
n6I["db-factory.ts"]
n6J["job-narrative-processor.ts"]
n6M["notifications.ts"]
subgraph n6N["orchestrator"]
n6O["cf-executor.ts"]
n6P["scenario.ts"]
end
n6Q["queue.ts"]
n6R["storage.ts"]
n6Q["queue.ts"]
n6R["storage.ts"]
end
subgraph n6S["types"]
n6T["chunk.ts"]
n6U["cloudflare.d.ts"]
n6V["contracts.ts"]
n6W["database-models.ts"]
n6Y["env.ts"]
n6Z["episode.ts"]
n70["index.ts"]
n71["manga-models.ts"]
n72["text-analysis.ts"]
n73["job.ts"]
n74["page-splitting.ts"]
n75["panel-layout.ts"]
n76["panel-layout.zod.ts"]
subgraph n6S["types"]
n6T["chunk.ts"]
n6U["cloudflare.d.ts"]
n6V["contracts.ts"]
n6W["database-models.ts"]
n6Y["env.ts"]
n6Z["episode.ts"]
n70["index.ts"]
n71["manga-models.ts"]
n72["text-analysis.ts"]
n73["job.ts"]
n74["page-splitting.ts"]
n75["panel-layout.ts"]
n76["panel-layout.zod.ts"]
end
subgraph n77["utils"]
n78["api-error-response.ts"]
n79["api-error.ts"]
n7B["http-errors.ts"]
n7C["api-responder.ts"]
n7D["chunk-splitter.ts"]
n7E["cloudflare-env.ts"]
n7F["episode-utils.ts"]
n7G["ids.ts"]
n7H["layout-templates.ts"]
n7I["request-mode.ts"]
n7J["storage.ts"]
n7K["text-splitter.ts"]
n7L["type-guards.ts"]
n7N["uuid.ts"]
n7O["validators.ts"]
subgraph n77["utils"]
n78["api-error-response.ts"]
n79["api-error.ts"]
n7B["http-errors.ts"]
n7C["api-responder.ts"]
n7D["chunk-splitter.ts"]
n7E["cloudflare-env.ts"]
n7F["episode-utils.ts"]
n7G["ids.ts"]
n7H["layout-templates.ts"]
n7I["request-mode.ts"]
n7J["storage.ts"]
n7K["text-splitter.ts"]
n7L["type-guards.ts"]
n7N["uuid.ts"]
n7O["validators.ts"]
end
end
subgraph n3["@"]
subgraph n4["config"]
n3B["app.config"]
subgraph n3["@"]
subgraph n4["config"]
n3B["app.config"]
end
subgraph n5["services"]
n6["db-factory"]
subgraph n5["services"]
n6["db-factory"]
V["adapters"]
subgraph W["orchestrator"]
X["scenario"]
end
subgraph n1I["application"]
n1J["episode-write"]
n1K["job-progress"]
n1U["analyze-pipeline"]
n24["output-service"]
n2D["job-details"]
n2V["layout-generation"]
n2W["render"]
subgraph n1I["application"]
n1J["episode-write"]
n1K["job-progress"]
n1U["analyze-pipeline"]
n24["output-service"]
n2D["job-details"]
n2V["layout-generation"]
n2W["render"]
end
n1L["job-narrative-processor"]
n2L["queue"]
n1L["job-narrative-processor"]
n2L["queue"]
end
subgraph A["infrastructure"]
subgraph B["logging"]
C["logger"]
end
subgraph n1P["storage"]
n1Q["chunk-repository"]
n2U["ports"]
subgraph n1P["storage"]
n1Q["chunk-repository"]
n2U["ports"]
end
end
subgraph F["agents"]
G["base-agent"]
subgraph H["layout"]
I["input-adapter"]
end
R["chunk-bundle-analyzer"]
n18["chunk-analyzer"]
n1O["narrative-arc-analyzer"]
subgraph n3I["scenarios"]
n3J["novel-to-manga"]
n18["chunk-analyzer"]
n1O["narrative-arc-analyzer"]
subgraph n3I["scenarios"]
n3J["novel-to-manga"]
end
n64["layout-generator"]
n65["page-splitter"]
n64["layout-generator"]
n65["page-splitter"]
end
subgraph J["domain"]
subgraph K["models"]
L["page"]
n5E["emotion"]
n6X["scene"]
n5E["emotion"]
n6X["scene"]
end
end
subgraph M["utils"]
N["layout-templates"]
n19["api-error"]
n1A["api-responder"]
n1B["storage"]
n1M["validators"]
n1R["episode-utils"]
n1V["request-mode"]
n1W["uuid"]
n5Z["text-splitter"]
n68["type-guards"]
n6H["ids"]
n19["api-error"]
n1A["api-responder"]
n1B["storage"]
n1M["validators"]
n1R["episode-utils"]
n1V["request-mode"]
n1W["uuid"]
n5Z["text-splitter"]
n68["type-guards"]
n6H["ids"]
end
subgraph Y["types"]
Z["contracts"]
n7M["panel-layout.zod"]
n7M["panel-layout.zod"]
end
subgraph n1F["repositories"]
n1G["adapters"]
n1H["job-repository"]
n2I["episode-repository"]
n30["novel-repository"]
n67["output-repository"]
subgraph n1F["repositories"]
n1G["adapters"]
n1H["job-repository"]
n2I["episode-repository"]
n30["novel-repository"]
n67["output-repository"]
end
subgraph n40["components"]
n41["HomeClient"]
n44["ScenarioViewer"]
n47["NovelUploader"]
n4A["ProcessingProgress"]
n4B["ResultsDisplay"]
n4C["TextInputArea"]
subgraph n40["components"]
n41["HomeClient"]
n44["ScenarioViewer"]
n47["NovelUploader"]
n4A["ProcessingProgress"]
n4B["ResultsDisplay"]
n4C["TextInputArea"]
end
subgraph n6A["lib"]
subgraph n6B["canvas"]
n6C["manga-page-renderer"]
n6D["thumbnail-generator"]
subgraph n6A["lib"]
subgraph n6B["canvas"]
n6C["manga-page-renderer"]
n6D["thumbnail-generator"]
end
end
subgraph n6F["db"]
n6G["schema"]
subgraph n6F["db"]
n6G["schema"]
end
subgraph n6K["errors"]
n6L["retryable-error"]
n7A["rate-limit-error"]
subgraph n6K["errors"]
n6L["retryable-error"]
n7A["rate-limit-error"]
end
end
n1S["crypto"]
subgraph n1Z["fs"]
n20["promises"]
n1S["crypto"]
subgraph n1Z["fs"]
n20["promises"]
end
n21["path"]
n2-->n7
n2-->n4
n2-->n6
n8-->n2
n9-->n8
n9-->n4
n9-->C
D-->n8
D-->n4
n21["path"]
n2-->n7
n2-->n4
n2-->n6
n8-->n2
n9-->n8
n9-->n4
n9-->C
D-->n8
D-->n4
E-->G
E-->I
E-->n4
E-->n4
E-->L
E-->N
Q-->n8
Q-->n8
Q-->R
Q-->n4
Q-->n4
S-->G
S-->n4
S-->n4
U-->V
U-->X
U-->Z
n14-->G
n14-->n4
n17-->n18
n17-->n4
n17-->C
n17-->n19
n17-->n1A
n17-->n1B
n1E-->n1G
n1E-->n1H
n1E-->n1J
n1E-->n1K
n1E-->n6
n1E-->n1L
n1E-->n19
n1E-->n1M
n1N-->n1O
n1N-->n1Q
n1N-->n19
n1N-->n1R
n1N-->n1B
n1N-->n1S
n1T-->C
n1T-->n1U
n1T-->n19
n1T-->n1A
n1T-->n1V
n1T-->n1W
n1Y-->n20
n1Y-->n21
n23-->C
n23-->n24
n23-->n1A
n23-->n1M
n27-->C
n27-->n24
n27-->n1A
n27-->n1M
n29-->n6
n29-->n19
n29-->n1B
n2C-->C
n2C-->n2D
n2C-->n19
n2C-->n1A
n2H-->n1G
n2H-->n2I
n2H-->n1H
n2H-->n1J
n2H-->n1K
n2H-->n6
n2H-->n1L
n2H-->n19
n2H-->n1M
n2K-->n1J
n2K-->n1K
n2K-->n6
n2K-->n1L
n2K-->n2L
n2K-->n19
n2K-->n1M
n2M-->n6
n2M-->n2L
n2M-->n19
n2O-->C
n2O-->n1F
n2O-->n19
n2O-->n1A
n2O-->n1M
n2Q-->C
n2Q-->n6
n2Q-->n1A
n2T-->C
n2T-->n2U
n2T-->n1K
n2T-->n2V
n2T-->n2W
n2T-->n1A
n2T-->n1V
n2Z-->n1G
n2Z-->n1H
n2Z-->n30
n2Z-->n6
n2Z-->n19
n2Z-->n1W
n2Z-->n1S
n31-->n33
n31-->n1G
n31-->n30
n31-->n6
n31-->n19
n31-->n1A
n33-->n19
n33-->n1B
n33-->n1W
n37-->n19
n37-->n1B
n37-->n1M
n39-->C
n39-->n1G
n39-->n2I
n39-->n1H
n39-->n2W
n39-->n6
n39-->n1A
n39-->n1M
n3A-->n3B
n3A-->C
n3A-->n2U
n3A-->n1G
n3A-->n2I
n3A-->n1H
n3A-->n2W
n3A-->n6
n3A-->n1A
n3A-->n1M
n3E-->n3B
n3E-->n1G
n3E-->n2I
n3E-->n1H
n3E-->n6
n3E-->n19
n3E-->n1B
n3E-->n1M
n3H-->n3J
n3H-->X
n3H-->Z
n3L-->n1G
n3L-->n2I
n3L-->n1H
n3L-->n6
n3L-->n19
n3L-->n1M
n3L-->n1S
n3N-->n3O
n3X-->n1G
n3X-->n2I
n3X-->n1H
n3X-->n6
n3X-->n1B
n3Y-->n1G
n3Y-->n2I
n3Y-->n1H
n3Y-->n6
n3Z-->n41
n43-->n44
n46-->n47
n49-->n4A
n49-->n4B
n49-->n4C
n4H-->n3J
n4L-->n4K
n4L-->n4M
n4O-->n4P
n4O-->n4
n4O-->n1Z
n4O-->n21
n4T-->n4U
n4T-->N
n4V-->n19
n4Z-->n50
n55-->n1B
n56-->n1B
n59-->n4
n5C-->n5B
n5C-->n5D
n5C-->n5F
n5C-->n5G
n5D-->n5B
n5D-->n5F
n5D-->n5G
n5D-->n3B
n5D-->n5E
n5G-->n5E
n5L-->n5N
n5L-->n19
n5O-->n5J
n5O-->n5K
n5O-->n5L
n5O-->n5P
n5O-->n5Q
n5O-->n5R
n5O-->n6
n5Q-->n5N
n5S-->n5K
n5S-->n5L
n5S-->n5O
n5S-->n5P
n5S-->n5Q
n5S-->n5R
n5S-->n5N
n5Y-->n18
n5Y-->n1O
n5Y-->n4
n5Y-->C
n5Y-->n1Q
n5Y-->n2U
n5Y-->n1F
n5Y-->n2V
n5Y-->n2W
n5Y-->n19
n5Y-->n1R
n5Y-->n1B
n5Y-->n5Z
n5Y-->n1W
n60-->n1G
n60-->n2I
n60-->n6
n61-->n1F
n61-->n19
n61-->n1B
n61-->n1Z
n61-->n21
n62-->n2U
n62-->n1G
n62-->n1H
n62-->n6
n63-->n64
n63-->n65
n63-->C
n63-->n2U
n63-->n1G
n63-->n2I
n63-->n1H
n63-->n6
n63-->n1B
n66-->n2U
n66-->n1G
n66-->n2I
n66-->n1H
n66-->n67
n66-->n6
n66-->n68
n66-->n1S
n69-->n3B
n69-->C
n69-->n2U
n69-->n6C
n69-->n6D
n69-->n6
n69-->n68
n6E-->n6F
n6E-->n6G
n6E-->n6H
n6E-->n1S
n6I-->n6E
n6J-->n1O
n6J-->n4
n6J-->n6L
n6J-->C
n6J-->n2U
n6J-->n1R
n6O-->n1S
n6Q-->n60
n6Q-->n62
n6Q-->n6J
n6Q-->n6M
n6W-->n6X
n70-->n6T
n70-->n6Y
n70-->n6Z
n70-->n71
n70-->n72
n72-->n5E
n72-->n6X
n76-->n5E
n78-->n79
n79-->n7B
n79-->n7A
n79-->n6L
n7C-->n79
n7F-->n4
n7F-->n1B
n7J-->n4
n7J-->n1J
n7J-->n1K
n7J-->n1Z
n7J-->n21
n7L-->n7M
n7O-->n19

````

n14-->G
n14-->n4
n17-->n18
n17-->n4
n17-->C
n17-->n19
n17-->n1A
n17-->n1B
n1E-->n1G
n1E-->n1H
n1E-->n1J
n1E-->n1K
n1E-->n6
n1E-->n1L
n1E-->n19
n1E-->n1M
n1N-->n1O
n1N-->n1Q
n1N-->n19
n1N-->n1R
n1N-->n1B
n1N-->n1S
n1T-->C
n1T-->n1U
n1T-->n19
n1T-->n1A
n1T-->n1V
n1T-->n1W
n1Y-->n20
n1Y-->n21
n23-->C
n23-->n24
n23-->n1A
n23-->n1M
n27-->C
n27-->n24
n27-->n1A
n27-->n1M
n29-->n6
n29-->n19
n29-->n1B
n2C-->C
n2C-->n2D
n2C-->n19
n2C-->n1A
n2H-->n1G
n2H-->n2I
n2H-->n1H
n2H-->n1J
n2H-->n1K
n2H-->n6
n2H-->n1L
n2H-->n19
n2H-->n1M
n2K-->n1J
n2K-->n1K
n2K-->n6
n2K-->n1L
n2K-->n2L
n2K-->n19
n2K-->n1M
n2M-->n6
n2M-->n2L
n2M-->n19
n2O-->C
n2O-->n1F
n2O-->n19
n2O-->n1A
n2O-->n1M
n2Q-->C
n2Q-->n6
n2Q-->n1A
n2T-->C
n2T-->n2U
n2T-->n1K
n2T-->n2V
n2T-->n2W
n2T-->n1A
n2T-->n1V
n2Z-->n1G
n2Z-->n1H
n2Z-->n30
n2Z-->n6
n2Z-->n19
n2Z-->n1W
n2Z-->n1S
n31-->n33
n31-->n1G
n31-->n30
n31-->n6
n31-->n19
n31-->n1A
n33-->n19
n33-->n1B
n33-->n1W
n37-->n19
n37-->n1B
n37-->n1M
n39-->C
n39-->n1G
n39-->n2I
n39-->n1H
n39-->n2W
n39-->n6
n39-->n1A
n39-->n1M
n3A-->n3B
n3A-->C
n3A-->n2U
n3A-->n1G
n3A-->n2I
n3A-->n1H
n3A-->n2W
n3A-->n6
n3A-->n1A
n3A-->n1M
n3E-->n3B
n3E-->n1G
n3E-->n2I
n3E-->n1H
n3E-->n6
n3E-->n19
n3E-->n1B
n3E-->n1M
n3H-->n3J
n3H-->X
n3H-->Z
n3L-->n1G
n3L-->n2I
n3L-->n1H
n3L-->n6
n3L-->n19
n3L-->n1M
n3L-->n1S
n3N-->n3O
n3X-->n1G
n3X-->n2I
n3X-->n1H
n3X-->n6
n3X-->n1B
n3Y-->n1G
n3Y-->n2I
n3Y-->n1H
n3Y-->n6
n3Z-->n41
n43-->n44
n46-->n47
n49-->n4A
n49-->n4B
n49-->n4C
n4H-->n3J
n4L-->n4K
n4L-->n4M
n4O-->n4P
n4O-->n4
n4O-->n1Z
n4O-->n21
n4T-->n4U
n4T-->N
n4V-->n19
n4Z-->n50
n55-->n1B
n56-->n1B
n59-->n4
n5C-->n5B
n5C-->n5D
n5C-->n5F
n5C-->n5G
n5D-->n5B
n5D-->n5F
n5D-->n5G
n5D-->n3B
n5D-->n5E
n5G-->n5E
n5L-->n5N
n5L-->n19
n5O-->n5J
n5O-->n5K
n5O-->n5L
n5O-->n5P
n5O-->n5Q
n5O-->n5R
n5O-->n6
n5Q-->n5N
n5S-->n5K
n5S-->n5L
n5S-->n5O
n5S-->n5P
n5S-->n5Q
n5S-->n5R
n5S-->n5N
n5Y-->n18
n5Y-->n1O
n5Y-->n4
n5Y-->C
n5Y-->n1Q
n5Y-->n2U
n5Y-->n1F
n5Y-->n2V
n5Y-->n2W
n5Y-->n19
n5Y-->n1R
n5Y-->n1B
n5Y-->n5Z
n5Y-->n1W
n60-->n1G
n60-->n2I
n60-->n6
n61-->n1F
n61-->n19
n61-->n1B
n61-->n1Z
n61-->n21
n62-->n2U
n62-->n1G
n62-->n1H
n62-->n6
n63-->n64
n63-->n65
n63-->C
n63-->n2U
n63-->n1G
n63-->n2I
n63-->n1H
n63-->n6
n63-->n1B
n66-->n2U
n66-->n1G
n66-->n2I
n66-->n1H
n66-->n67
n66-->n6
n66-->n68
n66-->n1S
n69-->n3B
n69-->C
n69-->n2U
n69-->n6C
n69-->n6D
n69-->n6
n69-->n68
n6E-->n6F
n6E-->n6G
n6E-->n6H
n6E-->n1S
n6I-->n6E
n6J-->n1O
n6J-->n4
n6J-->n6L
n6J-->C
n6J-->n2U
n6J-->n1R
n6O-->n1S
n6Q-->n60
n6Q-->n62
n6Q-->n6J
n6Q-->n6M
n6W-->n6X
n70-->n6T
n70-->n6Y
n70-->n6Z
n70-->n71
n70-->n72
n72-->n5E
n72-->n6X
n76-->n5E
n78-->n79
n79-->n7B
n79-->n7A
n79-->n6L
n7C-->n79
n7F-->n4
n7F-->n1B
n7J-->n4
n7J-->n1J
n7J-->n1K
n7J-->n1Z
n7J-->n21
n7L-->n7M
n7O-->n19

```

```
