flowchart LR

subgraph 0["src"]
subgraph 1["agents"]
2["agent.ts"]
7["errors.ts"]
8["base-agent.ts"]
9["chunk-analyzer.ts"]
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
subgraph 10["app"]
subgraph 11["api"]
subgraph 12["abtest"]
subgraph 13["analyze"]
14["route.ts"]
end
end
subgraph 15["analyze"]
subgraph 16["chunk"]
17["route.ts"]
end
subgraph 1C["narrative-arc"]
subgraph 1D["full"]
1E["route.ts"]
end
1N["route.ts"]
end
1T["route.ts"]
end
subgraph 1X["docs"]
1Y["route.ts"]
end
subgraph 22["export"]
23["route.ts"]
subgraph 25["zip"]
subgraph 26["[jobId]"]
27["route.ts"]
end
end
end
subgraph 28["health"]
29["route.ts"]
end
subgraph 2A["job"]
subgraph 2B["[id]"]
2C["route.ts"]
end
end
subgraph 2E["jobs"]
subgraph 2F["[jobId]"]
subgraph 2G["episodes"]
2H["route.ts"]
end
subgraph 2J["resume"]
2K["route.ts"]
end
2M["route.ts"]
subgraph 2N["status"]
2O["route.ts"]
end
subgraph 2P["token-usage"]
2Q["route.ts"]
end
end
end
subgraph 2R["layout"]
subgraph 2S["generate"]
2T["route.ts"]
end
end
subgraph 2X["novel"]
subgraph 2Y["db"]
2Z["route.ts"]
end
31["route.ts"]
subgraph 32["storage"]
33["route.ts"]
end
end
subgraph 34["render"]
subgraph 35["[episodeNumber]"]
subgraph 36["[pageNumber]"]
37["route.ts"]
end
end
subgraph 38["batch"]
39["route.ts"]
end
3A["route.ts"]
subgraph 3C["status"]
subgraph 3D["[jobId]"]
3E["route.ts"]
end
end
end
subgraph 3F["scenario"]
subgraph 3G["run"]
3H["route.ts"]
end
end
subgraph 3K["share"]
3L["route.ts"]
end
end
3M["error.tsx"]
3N["layout.tsx"]
3O["globals.css"]
3P["loading.tsx"]
3Q["not-found.tsx"]
subgraph 3R["novel"]
subgraph 3S["[novelId]"]
subgraph 3T["results"]
subgraph 3U["[jobId]"]
subgraph 3V["episode"]
subgraph 3W["[episodeNumber]"]
3X["page.tsx"]
end
end
end
3Y["page.tsx"]
end
end
end
3Z["page.tsx"]
subgraph 42["scenario"]
43["page.tsx"]
end
subgraph 45["test-novel"]
46["page.tsx"]
end
end
subgraph 48["components"]
49["HomeClient.tsx"]
4D["Logger.tsx"]
4E["NovelUploader.tsx"]
4F["ProcessingProgress.tsx"]
4G["ResultsDisplay.tsx"]
4H["ScenarioViewer.tsx"]
4I["TextInputArea.tsx"]
end
subgraph 4J["config"]
4K["app.config.ts"]
4L["index.ts"]
4M["llm.config.ts"]
end
subgraph 4N["db"]
4O["index.ts"]
4P["schema.ts"]
end
subgraph 4Q["domain"]
subgraph 4R["models"]
4S["emotion.ts"]
4T["page.ts"]
4U["panel.ts"]
4V["scene.ts"]
end
subgraph 4W["repositories"]
4X["chunk-repository.ts"]
end
end
subgraph 4Y["errors"]
4Z["rate-limit-error.ts"]
50["retryable-error.ts"]
end
subgraph 51["infrastructure"]
subgraph 52["logging"]
53["logger.ts"]
end
subgraph 54["storage"]
55["chunk-repository.ts"]
56["ports.ts"]
end
end
subgraph 57["lib"]
subgraph 58["cache"]
59["kv.ts"]
end
subgraph 5A["canvas"]
5B["canvas-renderer.ts"]
5C["index.ts"]
5D["manga-page-renderer.ts"]
5F["panel-layout-engine.ts"]
5G["speech-bubble-placer.ts"]
5H["thumbnail-generator.ts"]
end
end
subgraph 5I["repositories"]
5J["adapters.ts"]
5K["chunk-repository.ts"]
5L["episode-repository.ts"]
subgraph 5M["ports"]
5N["index.ts"]
end
5O["factory.ts"]
5P["job-repository.ts"]
5Q["novel-repository.ts"]
5R["output-repository.ts"]
5S["index.ts"]
end
subgraph 5T["services"]
subgraph 5U["adapters"]
5V["index.ts"]
end
5W["api.ts"]
subgraph 5X["application"]
5Y["analyze-pipeline.ts"]
60["episode-write.ts"]
61["job-details.ts"]
62["job-progress.ts"]
63["layout-generation.ts"]
66["output-service.ts"]
69["render.ts"]
end
6E["database.ts"]
6I["db-factory.ts"]
6J["job-narrative-processor.ts"]
6M["notifications.ts"]
subgraph 6N["orchestrator"]
6O["cf-executor.ts"]
6P["scenario.ts"]
end
6Q["queue.ts"]
6R["storage.ts"]
end
subgraph 6S["types"]
6T["chunk.ts"]
6U["cloudflare.d.ts"]
6V["contracts.ts"]
6W["database-models.ts"]
6Y["env.ts"]
6Z["episode.ts"]
70["index.ts"]
71["manga-models.ts"]
72["text-analysis.ts"]
73["job.ts"]
74["page-splitting.ts"]
75["panel-layout.ts"]
76["panel-layout.zod.ts"]
end
subgraph 77["utils"]
78["api-error-response.ts"]
79["api-error.ts"]
7B["http-errors.ts"]
7C["api-responder.ts"]
7D["chunk-splitter.ts"]
7E["cloudflare-env.ts"]
7F["episode-utils.ts"]
7G["ids.ts"]
7H["layout-templates.ts"]
7I["request-mode.ts"]
7J["storage.ts"]
7K["text-splitter.ts"]
7L["type-guards.ts"]
7N["uuid.ts"]
7O["validators.ts"]
end
end
subgraph 3["@"]
subgraph 4["config"]
3B["app.config"]
end
subgraph 5["services"]
6["db-factory"]
V["adapters"]
subgraph W["orchestrator"]
X["scenario"]
end
subgraph 1I["application"]
1J["episode-write"]
1K["job-progress"]
1U["analyze-pipeline"]
24["output-service"]
2D["job-details"]
2V["layout-generation"]
2W["render"]
end
1L["job-narrative-processor"]
2L["queue"]
end
subgraph A["infrastructure"]
subgraph B["logging"]
C["logger"]
end
subgraph 1P["storage"]
1Q["chunk-repository"]
2U["ports"]
end
end
subgraph F["agents"]
G["base-agent"]
subgraph H["layout"]
I["input-adapter"]
end
R["chunk-bundle-analyzer"]
18["chunk-analyzer"]
1O["narrative-arc-analyzer"]
subgraph 3I["scenarios"]
3J["novel-to-manga"]
end
64["layout-generator"]
65["page-splitter"]
end
subgraph J["domain"]
subgraph K["models"]
L["page"]
5E["emotion"]
6X["scene"]
end
end
subgraph M["utils"]
N["layout-templates"]
19["api-error"]
1A["api-responder"]
1B["storage"]
1M["validators"]
1R["episode-utils"]
1V["request-mode"]
1W["uuid"]
5Z["text-splitter"]
68["type-guards"]
6H["ids"]
end
subgraph Y["types"]
Z["contracts"]
7M["panel-layout.zod"]
end
subgraph 1F["repositories"]
1G["adapters"]
1H["job-repository"]
2I["episode-repository"]
30["novel-repository"]
67["output-repository"]
end
subgraph 40["components"]
41["HomeClient"]
44["ScenarioViewer"]
47["NovelUploader"]
4A["ProcessingProgress"]
4B["ResultsDisplay"]
4C["TextInputArea"]
end
subgraph 6A["lib"]
subgraph 6B["canvas"]
6C["manga-page-renderer"]
6D["thumbnail-generator"]
end
end
subgraph 6F["db"]
6G["schema"]
end
subgraph 6K["errors"]
6L["retryable-error"]
7A["rate-limit-error"]
end
end
1S["crypto"]
subgraph 1Z["fs"]
20["promises"]
end
21["path"]
2-->7
2-->4
2-->6
8-->2
9-->8
9-->4
9-->C
D-->8
D-->4
E-->G
E-->I
E-->4
E-->L
E-->N
Q-->8
Q-->R
Q-->4
S-->G
S-->4
U-->V
U-->X
U-->Z
14-->G
14-->4
17-->18
17-->4
17-->C
17-->19
17-->1A
17-->1B
1E-->1G
1E-->1H
1E-->1J
1E-->1K
1E-->6
1E-->1L
1E-->19
1E-->1M
1N-->1O
1N-->1Q
1N-->19
1N-->1R
1N-->1B
1N-->1S
1T-->C
1T-->1U
1T-->19
1T-->1A
1T-->1V
1T-->1W
1Y-->20
1Y-->21
23-->C
23-->24
23-->1A
23-->1M
27-->C
27-->24
27-->1A
27-->1M
29-->6
29-->19
29-->1B
2C-->C
2C-->2D
2C-->19
2C-->1A
2H-->1G
2H-->2I
2H-->1H
2H-->1J
2H-->1K
2H-->6
2H-->1L
2H-->19
2H-->1M
2K-->1J
2K-->1K
2K-->6
2K-->1L
2K-->2L
2K-->19
2K-->1M
2M-->6
2M-->2L
2M-->19
2O-->C
2O-->1F
2O-->19
2O-->1A
2O-->1M
2Q-->C
2Q-->6
2Q-->1A
2T-->C
2T-->2U
2T-->1K
2T-->2V
2T-->2W
2T-->1A
2T-->1V
2Z-->1G
2Z-->1H
2Z-->30
2Z-->6
2Z-->19
2Z-->1W
2Z-->1S
31-->33
31-->1G
31-->30
31-->6
31-->19
31-->1A
33-->19
33-->1B
33-->1W
37-->19
37-->1B
37-->1M
39-->C
39-->1G
39-->2I
39-->1H
39-->2W
39-->6
39-->1A
39-->1M
3A-->3B
3A-->C
3A-->2U
3A-->1G
3A-->2I
3A-->1H
3A-->2W
3A-->6
3A-->1A
3A-->1M
3E-->3B
3E-->1G
3E-->2I
3E-->1H
3E-->6
3E-->19
3E-->1B
3E-->1M
3H-->3J
3H-->X
3H-->Z
3L-->1G
3L-->2I
3L-->1H
3L-->6
3L-->19
3L-->1M
3L-->1S
3N-->3O
3X-->1G
3X-->2I
3X-->1H
3X-->6
3X-->1B
3Y-->1G
3Y-->2I
3Y-->1H
3Y-->6
3Z-->41
43-->44
46-->47
49-->4A
49-->4B
49-->4C
4H-->3J
4L-->4K
4L-->4M
4O-->4P
4O-->4
4O-->1Z
4O-->21
4T-->4U
4T-->N
4V-->19
4Z-->50
55-->1B
56-->1B
59-->4
5C-->5B
5C-->5D
5C-->5F
5C-->5G
5D-->5B
5D-->5F
5D-->5G
5D-->3B
5D-->5E
5G-->5E
5L-->5N
5L-->19
5O-->5J
5O-->5K
5O-->5L
5O-->5P
5O-->5Q
5O-->5R
5O-->6
5Q-->5N
5S-->5K
5S-->5L
5S-->5O
5S-->5P
5S-->5Q
5S-->5R
5S-->5N
5Y-->18
5Y-->1O
5Y-->4
5Y-->C
5Y-->1Q
5Y-->2U
5Y-->1F
5Y-->2V
5Y-->2W
5Y-->19
5Y-->1R
5Y-->1B
5Y-->5Z
5Y-->1W
60-->1G
60-->2I
60-->6
61-->1F
61-->19
61-->1B
61-->1Z
61-->21
62-->2U
62-->1G
62-->1H
62-->6
63-->64
63-->65
63-->C
63-->2U
63-->1G
63-->2I
63-->1H
63-->6
63-->1B
66-->2U
66-->1G
66-->2I
66-->1H
66-->67
66-->6
66-->68
66-->1S
69-->3B
69-->C
69-->2U
69-->6C
69-->6D
69-->6
69-->68
6E-->6F
6E-->6G
6E-->6H
6E-->1S
6I-->6E
6J-->1O
6J-->4
6J-->6L
6J-->C
6J-->2U
6J-->1R
6O-->1S
6Q-->60
6Q-->62
6Q-->6J
6Q-->6M
6W-->6X
70-->6T
70-->6Y
70-->6Z
70-->71
70-->72
72-->5E
72-->6X
76-->5E
78-->79
79-->7B
79-->7A
79-->6L
7C-->79
7F-->4
7F-->1B
7J-->4
7J-->1J
7J-->1K
7J-->1Z
7J-->21
7L-->7M
7O-->19
