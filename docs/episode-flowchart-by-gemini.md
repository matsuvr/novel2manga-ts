# Episode Generation Flowchart

This document outlines the process of generating final `episode_*.json` files from `script_chunk_*.json` files and episode boundary information. This flowchart is intended to visualize the complex, non-LLM part of the process to aid in refactoring.

```mermaid
graph TD
    A[Start] --> B{Inputs};
    subgraph "Inputs"
        B1[All `script_chunk_*.json` files]
        B2[Episode Boundary Information (from LLM)]
    end

    B --> C[1. Group `script_chunk` data by Episode];
    C --> D["2. Loop through each Episode Group"];
    D --> E["3. <b>Aggregate and Transform Chunks into Final Episode Structure</b>"];

    subgraph "Step 3 Details (The Complex Part)"
        direction LR
        E1[Initialize a new Episode object] --> E2[Iterate through all `script_chunk` data for the current episode] --> E3[Append Panels from chunks to a temporary list] --> E4[Apply page-breaking logic to distribute Panels across Pages] --> E5[Renumber all `page_number` and `panel.id` sequentially]
    end
    
    E --> E1;

    E5 --> F["4. Validate the final Episode JSON structure"];
    F --> G["5. Generate file name (e.g., `episode_1.json`)"];
    G --> H["6. Write the complete JSON object to the file"];
    H --> I[End of process for one episode];

    D -- "Next Episode Group" --> E;
    I -- "Process finished for all episodes" --> J[End];

    style E fill:#fce3e3,stroke:#b02424,stroke-width:2px
```

## Process Description

1.  **Inputs**: The process starts with two key inputs:
    *   A collection of `script_chunk_*.json` files, each containing a piece of the story.
    *   Episode boundary data, previously determined by an LLM, which specifies which chunks belong to which episode.

2.  **Group Chunks**: The `script_chunk` data is read and grouped together according to the episode boundaries. For example, chunks 1-5 form Episode 1, chunks 6-10 form Episode 2, etc.

3.  **Loop & Aggregate**: The system then iterates through each of these episode groups. For each episode, it performs the most complex step:
    *   It initializes a new JSON structure for the episode.
    *   It collects all panels from the chunks belonging to that episode.
    *   It applies internal logic to arrange these panels into a sequence of pages. This is likely where complexity arises (e.g., deciding how many panels fit on a page).
    *   Finally, it re-numbers all pages and panels to ensure they are sequential and consistent within that single episode file.

4.  **Validate & Write**: The newly created episode structure is validated. If it's valid, a filename is generated (e.g., `episode_1.json`), and the data is written to disk.

5.  **Repeat**: The process repeats for the next group of chunks until all episodes have been generated.
