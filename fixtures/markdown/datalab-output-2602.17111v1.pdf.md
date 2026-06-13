

# Instructor-Aligned Knowledge Graphs for Personalized Learning

Abdulrahman AlRabah, Priyanka Kargupta, Jiawei Han, Abdussalam Alawini

University of Illinois Urbana-Champaign  
Siebel School of Computing and Data Science  
Urbana, IL, USA  
{alrabah2,pk36,hanj,alawini}@illinois.edu

## Abstract

Mastering educational concepts requires understanding both their prerequisites (e.g., recursion before merge sort) and sub-concepts (e.g., merge sort as part of sorting algorithms). Capturing these dependencies is critical for identifying students' knowledge gaps and enabling targeted intervention for personalized learning. This is especially challenging in large-scale courses, where instructors cannot feasibly diagnose individual misunderstanding or determine which concepts need reinforcement. While knowledge graphs offer a natural representation for capturing these conceptual relationships at scale, existing approaches are either surface-level (focusing on course-level concepts like "Algorithms" or logistical relationships such as course enrollment), or disregard the rich pedagogical signals embedded in instructional materials. We propose InstructKG, a framework for automatically constructing instructor-aligned knowledge graphs that capture a course's intended learning progression. Given a course's lecture materials (slides, notes, etc.), INSTRUCTKG extracts significant concepts as nodes and infers learning dependencies as directed edges (e.g., "part-of" or "depends-on" relationships). The framework synergizes the rich temporal and semantic signals unique to educational materials (e.g., "recursion" is taught before "mergesort"; "recursion" is mentioned in the definition of "merge sort") with the generalizability of large language models. Through experiments on real-world, diverse lecture materials across multiple courses and human-based evaluation, we demonstrate that InstructKG captures rich, instructor-aligned learning progressions.

## CCS Concepts

• **Applied computing** → *Computer-assisted instruction*; • **Computing methodologies** → **Knowledge representation and reasoning**.

## Keywords

Knowledge graph, Large language models, Personalized learning, Instructor-aligned

## 1 Introduction

Learning educational concepts is incremental, with each new idea building on previously acquired foundations. Understanding these conceptual dependencies, such as knowing that recursion must be understood before merge sort, or that merge sort is a specific instance of sorting algorithms, is critical for effective learning. When students lack awareness of these prerequisite relationships, they often struggle to identify knowledge gaps, leading to compounding difficulties as courses progress [18, 19].

![Figure 1: INSTRUCTKG workflow and resulting knowledge graph. The top part shows two lecture chunks. Chunk 1 defines merge sort as a recursive sorting algorithm. Chunk 2 provides an example of merge sort as a divide-and-conquer algorithm using recursion. The bottom part shows the LLM relation judger processing these chunks to create a knowledge graph. The graph has nodes for 'Merge sort', 'Sorting algo', 'Div & con', and 'Recursion'. Edges indicate 'Part of' relationships from 'Merge sort' to 'Sorting algo' and 'Div & con', and a 'Depends on' relationship from 'Merge sort' to 'Recursion'.](7cea8cfa9ce0cdc9fe5f3f27384ed943_img.jpg)

The diagram illustrates the INSTRUCTKG process. At the top, two lecture chunks are shown. **Chunk 1** states: "Merge sort is a sorting algorithm that recursively divides an array and merges the results. This method assumes familiarity with recursion from earlier lectures. Also....". **Chunk 2** states: "For example, merge sort is a divide-and-conquer algorithm: it uses recursive calls to split the array into halves, sorts each half, and combines the results." Below these, the chunks are categorized into **Chunk 1 (Concept A, Role)** with details: "Merge sort, Example Sorting algo, Assumption Recursion, Assumption" and **Chunk 2 (Concept B, Role)** with details: "Merge sort, Definition Div & con, Assumption". These are fed into an **LLM relation judger**. The output is a knowledge graph with nodes: "Sorting algo", "Merge sort", "Div & con", and "Recursion". Edges show "Merge sort" is a "Part of" "Sorting algo" and "Div & con", and "Merge sort" "Depends on" "Recursion".

Figure 1: INSTRUCTKG workflow and resulting knowledge graph. The top part shows two lecture chunks. Chunk 1 defines merge sort as a recursive sorting algorithm. Chunk 2 provides an example of merge sort as a divide-and-conquer algorithm using recursion. The bottom part shows the LLM relation judger processing these chunks to create a knowledge graph. The graph has nodes for 'Merge sort', 'Sorting algo', 'Div & con', and 'Recursion'. Edges indicate 'Part of' relationships from 'Merge sort' to 'Sorting algo' and 'Div & con', and a 'Depends on' relationship from 'Merge sort' to 'Recursion'.

**Figure 1: INSTRUCTKG extracts concepts from lecture chunks, classifies their pedagogical roles, and infers relationships. In this example, merge sort depends on recursion as a prerequisite, and sorting algorithms and divide-and-conquer are part of merge sort.**

This challenge is particularly acute in large-scale educational settings, where instructors cannot feasibly diagnose individual misconceptions or provide personalized guidance on which foundational concepts require reinforcement [7].

Consider the example shown in Figure 1. A lecture segment introducing merge sort may reference recursion in its definition (e.g., "merge sort recursively divides the array...") and assume familiarity with the concept from earlier instruction. A student who missed or inadequately understood recursion will struggle with merge sort and with subsequent topics that depend on it. Capturing these implicit dependencies, both prerequisite relationships (e.g., recursion must be learned *before* merge sort) and compositional relationships (e.g., merge sort is *part of* sorting algorithms) would enable automated systems to identify precisely where a student's understanding breaks down and recommend targeted remediation.

<sup>0</sup>Code: <https://github.com/aalrabah/instructkg.git>

Knowledge graphs offer a natural representation for encoding such conceptual dependencies at scale. However, existing approaches fall short in capturing the fine-grained, instructor-aligned relationships embedded in course materials. Methods that rely on external knowledge bases or metadata-driven signals identify prerequisites through corpus co-occurrence or structured resources like the Semantic Web [1, 6], but operate at the level of broad topics (e.g., “Algorithms” or “Data Structures”) rather than the specific concepts within a single course [24, 30]. Text-based extraction approaches, from OpenIE pipelines [25] to recent LLM-based methods with multi-stage canonicalization [10, 17, 21, 28, 29], improve extraction quality but process each passage independently without access to instructional signals. Yet prerequisite structure is often implicit in educational discourse and expressed through teaching order, linguistic cues such as “assume...” or “recall...”, and the pedagogical roles concepts play across lecture segments. Our experiments show that even advanced LLM-based extraction, without instructor-grounded signals, does not produce accurate pedagogical knowledge graphs.

We observe that instructional materials contain rich, underutilized signals for inferring concept dependencies. First, temporal signals refer to the sequence in which an instructor presents concepts. Concepts introduced earlier often serve as prerequisites for those presented later. Second, semantic signals indicate how a concept is discussed and reveal its pedagogical role. When a concept appears within the definition of another, it suggests a foundational dependency. In contrast, when a concept is used as an example, it indicates an illustrative relationship. These signals are unique to educational content and are largely overlooked by current extraction methods.

In this paper, we propose INSTRUCTKG, a framework for automatically constructing instructor-aligned knowledge graphs from lecture materials. Given a course’s instructional content (slides, notes, transcripts), INSTRUCTKG extracts concepts as nodes and infers learning dependencies as directed edges with constrained relation types: depends-on (prerequisite relationships) and part-of (compositional relationships). Our framework synergizes the temporal and semantic signals embedded in educational materials with the reasoning capabilities of large language models (LLMs), enabling accurate dependency inference without relying on external knowledge bases or manual annotation.

**Our contributions of this paper are as follows:**

- We introduce a methodology that leverages temporal signals (teaching order) and semantic signals (concept roles in context) unique to instructional materials to ground LLM-based reasoning in instructor-aligned evidence, rather than relying on the model’s parametric knowledge alone.
- We design a cluster-based evidence mechanism that identifies potential concept relationships even when concepts do not co-occur within the same instructional segment, which captures implicit dependencies beyond chunk-level co-occurrence.
- We conduct experiments on real-world lecture materials across multiple courses and perform human evaluation, demonstrating that INSTRUCTKG captures rich learning progressions aligned with pedagogical intent.

## 2 Related Works

**Knowledge Graph Construction.** Methods for constructing knowledge graphs from text range from rule-based and OpenIE approaches to supervised neural extraction and more recently, LLM-based prompting [12, 14, 17, 20, 22, 28]. Representative supervised neural extraction systems jointly identify entities and relations using span-based and graph-based formulations [9, 15, 31]. Neural extraction methods can directly link entity pairs in a single pass for end-to-end triple extraction [23]. More recent work has shifted toward LLM-based pipelines that extract triples and canonicalize entities and relations through multi-stage processing. KGGen [17] applies iterative clustering to merge duplicate entities and relations into canonical representations. EDC [28] uses a three-phase extract, define, canonicalize pipeline with embedding retrieval and LLM verification. Other methods incorporate entity-centric denoising with fine-tuned graph judgment [10], adaptive schema-constrained normalization via relational semantic matching [21], curriculum learning across diverse graph types [29], and OpenIE combined with LLM-based validation [25]. Marker-based extraction models further improve joint entity–relation extraction by explicitly highlighting candidate mentions in-context, yielding strong performance across diverse extraction settings [27].

However, these methods are designed for general-purpose knowledge graph construction and do not leverage signals specific to educational materials. None incorporate teaching order, pedagogical role classification, or cross-segment evidence aggregation to infer concept dependencies.

**Educational Knowledge Graphs and Prerequisite Learning.** Prior work on educational knowledge graphs has relied on Semantic Web resources, using SPARQL queries over DBpedia and Wikidata to retrieve prerequisite candidates [1, 6, 21]. Prerequisite detection is often framed as binary classification using co-occurrence statistics [6], while ontology-guided approaches extract relations from textbooks via NER, entity linking, and OpenIE with predicate mapping [30].

These methods face key limitations. External knowledge bases may not reflect instructor-specific definitions or course-level nuances [4, 21, 30]. Co-occurrence and TF-IDF signals are too coarse for fine-grained prerequisite relationships [6], and ontology-guided methods require substantial human annotation [30]. In contrast, INSTRUCTKG extracts dependencies directly from lecture materials, leveraging both temporal signals (teaching order) and semantic signals (concept roles in context) to construct instructor-aligned knowledge graphs.

**Concept Extraction from Educational Content.** Several methods target concept extraction from educational materials. WERECE [11] proposes an unsupervised approach using pre-trained word embeddings, manifold learning, and clustering to identify domain concepts from educational text. [16] addresses concept extraction from MOOC lecture subtitles using a distantly supervised NER framework with discipline-aware dictionary empowerment and self-training. However, these methods focus solely on entity extraction and identifying concept mentions without inferring relationships between concepts. Related work has also explored modeling the sequential structure of educational content at the lecture level. [2] cluster similar lectures across MOOCs using constrained K-Means

and link clusters by lecture sequence order to build precedence graphs, while follow-up work [3] models topic transitions by mapping lectures to latent topics and learning transition probabilities from lecture sequences. These methods use temporal ordering but only operate at the lecture level. They do not extract concepts or classify roles. In contrast, INSTRUCTKG operates at the concept level, leveraging pedagogical roles and cross-segment evidence to infer fine-grained dependency relationships directly from lecture materials.

**LLMs for Information Extraction.** Recent work has explored LLMs for knowledge graph construction from text. GenIE [13] uses autoregressive generation to extract (subject, relation, object) triplets grounded to a predefined KB schema. CodeKGC [5] frames triple extraction as code generation, using schema-aware prompts with optional rationale-enhanced generation. While these methods extract both entities and relationships, they target KB-grounded factual triplets constrained by predefined schemas. They do not model pedagogical relations such as prerequisites or part-of dependencies, nor do they incorporate educational signals like concept roles or teaching order. INSTRUCTKG uses LLM reasoning with temporal and semantic signals from instructional materials to infer instructor-aligned dependencies.

## 3 Methodology

We propose INSTRUCTKG, a framework for automatically constructing instructor-aligned knowledge graphs from course materials by extracting fine-grained concepts and inferring two types of learning dependencies between them: `depends_on` (prerequisite) and `part_of` (compositional).

INSTRUCTKG operates through three phases as illustrated in 2 (1) document processing and concept extraction, which converts course material PDFs into text chunks and identifies concepts with their pedagogical roles; (2) evidence aggregation, which clusters semantically similar chunks and constructs evidence packets for candidate concept pairs; and (3) relation judgment and knowledge graph construction, which determines the final edge types using an LLM.

Given a set of lecture documents  $\mathcal{D} = \{d_1, d_2, \dots, d_n\}$  ordered by their teaching sequence, our goal is to construct a directed knowledge graph  $\mathcal{G} = (\mathcal{V}, \mathcal{E})$  where  $\mathcal{V}$  represents concepts extracted from the lectures and  $\mathcal{E} \subseteq \mathcal{V} \times \mathcal{V} \times \{\text{depends\_on}, \text{part\_of}\}$  represents pedagogical relationships. An edge  $(A, B, \text{depends\_on})$  indicates that concept  $A$  requires concept  $B$  as a prerequisite, while  $(A, B, \text{part\_of})$  indicates that  $A$  is a component or subtype of  $B$ .

## 3.1 Problem Formulation

Given an ordered set of lecture documents  $D = \{d_1, d_2, \dots, d_n\}$ , where each  $d_i$  is a PDF that may contain slides, lecture notes, or other instructional material, sorted by teaching sequence. Our goal is to construct a directed knowledge graph  $G = (V, E)$ , where  $V$  is the set of concepts extracted from the lectures and  $E \subseteq V \times V \times R$ . The relation set  $R = \{\text{depends\_on}, \text{part\_of}\}$  captures two types of pedagogical relationships: an edge  $(A, B, \text{depends\_on})$  indicates that concept  $A$  requires concept  $B$  as a prerequisite (e.g., “merge sort” `depends_on` “recursion”), and an edge  $(A, B, \text{part\_of})$  indicates that concept  $A$  is a component or subtype of concept  $B$  (e.g.,

“merge sort” `part_of` “sorting algorithms”). For each occurrence of a concept  $v$  in a chunk  $c$ , we assign a pedagogical role  $r(v, c) \in P$ , where  $P = \{\text{DEFINITION}, \text{EXAMPLE}, \text{ASSUMPTION}, \text{NA}\}$ . **DEFINITION** indicates the concept is being introduced or explained; **EXAMPLE** indicates it is demonstrated through a concrete instance; **ASSUMPTION** indicates it is referenced as prior knowledge; and **NA** indicates no clear pedagogical function in that context.

**Phase 1: Pre-processing & Concept Extraction.** The first phase converts lecture PDFs into a structured corpus of text chunks and extracts concepts with their pedagogical roles. Given a set of PDF files, we first sort them in natural teaching order by extracting lecture or chapter numbers from filenames (e.g., “lecture-03”, “ch2”). Each PDF is processed using a document converter and split into chunks constrained by a maximum token limit, with adjacent related segments merged to reduce fragmentation. For each chunk  $c_i$  in lecture  $d_j$ , we store metadata including the lecture identifier, chunk index, and page numbers. This produces a corpus  $C = \{c_1, c_2, \dots, c_m\}$  where each chunk is associated with a unique identifier of the form `lecture_id_chunk_index`.

**Concept Extraction.** For each chunk  $c \in C$ , we prompt an open-source, instruction-tuned LLM (specific models detailed in Section 4.4) to extract meaningful course concepts, excluding code tokens, variable names, and example values. Extracted concepts are deduplicated case-insensitively while preserving order. Each concept is assigned a canonical identifier via deterministic normalization: the concept string is uppercased and non-alphanumeric characters are replaced with underscores (e.g., “Left outer join”  $\rightarrow$  `LEFT OUTER JOIN`).

### 3.2 Mapping Pedagogical Roles to Concepts

Beyond identifying which concepts appear in each chunk, understanding how a concept is used in context provides a strong signal for inferring relationships. Consider the example in Figure 1. In Chunk 1, *merge sort* appears as an **EXAMPLE** of a *sorting algorithm*, while *sorting algorithms* and *recursion* are referenced as assumed background. In Chunk 2, *merge sort* is being **DEFINED**, and *divide-and-conquer* is assumed as prior knowledge. These role pairings directly inform relationship inference: when a concept appears as an **ASSUMPTION** in a chunk where another concept is being **DEFINED**, this signals a prerequisite dependency (e.g., *merge sort* `depends_on` *recursion*). When a concept appears as an **EXAMPLE** alongside another concept’s **DEFINITION**, this suggests a compositional relationship (e.g., *merge sort* `part_of` *sorting algorithms*). We classify three pedagogical roles, **DEFINITION**, **EXAMPLE**, and **ASSUMPTION**, as these are the most informative for distinguishing `depends_on` and `part_of` relationships. Other roles (e.g., Application, Comparison) may occur in instructional materials but are less directly indicative of these relationship types and are not considered.

**Role Classification.** For each (chunk, concept) pair, we classify the pedagogical role the concept plays:

- **Definition:** The concept is being defined, explained, or introduced.
- **Example:** The concept is demonstrated through a concrete walkthrough.

![Figure 2: Overview of the INSTRUCTKG framework showing the three-phase pipeline. Phase 1: Document Processing & Concept Extraction. Phase 2: Evidence Aggregation. Phase 3: Relation Judgment & Knowledge Graph Construction.](2fa4a1bf91d0f34e87c689fbc1211fe3_img.jpg)

The diagram illustrates the INSTRUCTKG framework's three-phase pipeline:

- Phase 1: Document Processing & Concept Extraction**: This phase takes input documents (PDF, Course material) and processes them through Chunking and Meta data extraction. The output is a structured JSON object containing lecture\_id, chunk\_id, page\_numbers, and text. The text is then mapped to roles (Definition, Example, Assumption) and concepts (Recursion, Merge Sort).
- Phase 2: Evidence Aggregation**: This phase involves Clustering of concepts. It identifies pairs of concepts (A, B) that appear in the same chunk or in the same cluster across different chunks. These are then aggregated into a Concept Pair.
- Phase 3: Relation Judgment & Knowledge Graph Construction**: This phase uses a Relation Judger to evaluate the aggregated concept pairs. The results are used to build a Knowledge Graph. The graph shows relationships between concepts like 'Sorting algo', 'Merge sort', 'Div & con', and 'Recursion'. The graph is then used to build a prompt for the LLM, which includes information about the concept, role, temporal information, and evidence mode and statistics.

Figure 2: Overview of the INSTRUCTKG framework showing the three-phase pipeline. Phase 1: Document Processing & Concept Extraction. Phase 2: Evidence Aggregation. Phase 3: Relation Judgment & Knowledge Graph Construction.

Figure 2: Overview of the INSTRUCTKG framework showing the three-phase pipeline.

- **Assumption:** The concept is used as prior knowledge—a key signal for prerequisite relationships.
- **NA:** The concept does not clearly fit the above roles.

The output is a set of *mention* records  $\mathcal{M}$ , where each mention  $m = (\text{concept\_id}, \text{chunk\_id}, \text{lecture\_id}, \text{role})$  captures a concept’s occurrence and pedagogical context. We also track the first introduction of each concept by teaching order:

$$\text{first}(v) = \arg \min_{m \in \mathcal{M}(v)} (\text{lecture\_index}(m), \text{chunk\_index}(m)). \quad (1)$$

### 3.3 Context Clustering

Role classification captures relationships between concepts that co-occur within the same chunk. However, pedagogically related concepts are often separated by chunking boundaries, for instance, sorting algorithms may be introduced at the beginning of a chapter while merge sort is defined on the next page. To avoid sensitivity to the chunking algorithm, we need a mechanism to identify related concepts across chunk boundaries.

**Phase 2: Evidence Aggregation.** While chunk-level co-occurrence captures explicit relationships, concepts discussed in related contexts but separate chunks may still have pedagogical dependencies. To surface these implicit relationships, we cluster semantically similar chunks. We embed each chunk using a sentence-transformer model to obtain vector representations  $\mathbf{x}_c \in \mathbb{R}^d$  for each chunk  $c$ . We then apply UMAP for dimensionality reduction (using cosine distance) followed by HDBSCAN for density-based clustering. This assigns each chunk a cluster label  $\ell_c \in \{-1, 0, 1, \dots, k\}$ , where  $-1$  denotes noise.

For each concept mapped to a cluster, we select representative chunks by computing the cluster centroid  $\mu = \frac{1}{|C|} \sum_{c \in C} \mathbf{x}_c$  and ranking chunks by cosine similarity to  $\mu$ . These representative chunks serve as the most relevant evidence provided to the LLM during relation judgment. Finally, we enrich each cluster with its concept set by building a mapping from chunk identifiers to concepts and taking the union over all chunks in the cluster. Together with chunk-level co-occurrence, this allows us to identify which concepts are likely to have a direct relationship from both a local (chunk) and global (corpus) level.

**Temporal & Role-Grounded Evidence.** For each candidate concept pair  $(A, B)$ , we construct an evidence packet that aggregates the signals collected in the previous phases: the pedagogical roles of each concept, temporal information capturing where each concept was first introduced in the lecture sequence, and the relevant evidence text. Candidate pairs are generated from two sources: chunk co-occurrence (pairs appearing in the same chunk) and cluster co-occurrence (pairs appearing in the same thematic cluster but in different chunks). Pairs with neither form of evidence are excluded. The contents of each evidence packet are then passed to the relation judgment phase described next.

### 3.4 Relation Judgment and Knowledge Graph Construction

**Phase 3: Relation Judgment and Knowledge Graph Construction.** The final phase uses an LLM to determine the relation type for each candidate pair based on the aggregated evidence.

**Evidence Selection.** For each pair  $(A, B)$ , we select evidence using a priority scheme. If chunk co-occurrence exists, we provide chunks containing both concepts, as these offer the most direct evidence of relatedness. Otherwise, if cluster co-occurrence exists, we provide separate chunks for  $A$  and  $B$  from the shared thematic cluster, allowing the model to infer relationships from contextual similarity. Pairs with neither form of evidence are skipped.

**Relation Judgment.** We prompt the LLM with the concept pair, their pedagogical roles, temporal information, and the selected evidence chunks. The model determines whether  $A$  depends\_on  $B$  (indicating  $A$  requires  $B$  as a prerequisite),  $A$  is part\_of  $B$  (indicating  $A$  is a component or subtype of  $B$ ), or no clear pedagogical relationship exists. The prompt enforces that the relation direction is always from  $A$  to  $B$  and requires the model to provide a justification grounded in the provided evidence. To ensure consistency and avoid duplicate edges, pairs are normalized alphabetically so that  $(A, B)$  and  $(B, A)$  map to the same candidate. Full prompt templates are provided in Appendix B.

**Knowledge Graph Construction.** The final knowledge graph  $\mathcal{G} = (\mathcal{V}, \mathcal{E})$  is assembled by collecting all non-null relation judgments as directed edges. Each edge is accompanied by the extracted evidence and justification, providing interpretability for the inferred relationships.

## 4 Experimental Design

**Table 1: Dataset statistics for the three evaluated courses.**

| Course           | Format         | Lectures | Pages | Chunks |
|------------------|----------------|----------|-------|--------|
| Database Systems | Slides         | 27       | 569   | 552    |
| NLP              | Slides + Notes | 15       | 971   | 962    |
| Algorithms       | Lecture Notes  | 9        | 222   | 221    |

## 4.1 Datasets

We evaluate INSTRUCTKG on three real-world courses taught at a large public university, spanning diverse domains within computer science (Table 1). **Database Systems** covers relational databases, SQL, NoSQL, query optimization, and transaction processing. **Natural Language Processing** introduces text processing, language models, and neural approaches. **Algorithms** covers fundamental algorithm design and analysis. The courses vary in format, size, and instructional density, allowing us to evaluate INSTRUCTKG’s robustness across different teaching styles and course scales.

**Ablations.** We also conduct ablations on INSTRUCTKG to isolate the contribution of each component. **No Clustering** removes the thematic clustering phase, limiting evidence to chunk-level co-occurrence only. **No Roles** removes pedagogical role classification, so the LLM judge receives evidence text and temporal information but no role labels. All ablations use the three models Llama-3B, Llama-8B, Qwen-14B.

### 4.2 Baselines

We compare INSTRUCTKG against two recent LLM-based knowledge graph construction methods, adapting each to our target schema and input format for fair comparison. **KGGen** [17]. **EDC** [28] is a

three-phase extract, define, canonicalize framework that performs open triplet extraction and canonicalizes relations via embedding retrieval and LLM verification. We provide it with our target schema definitions. Both baselines operate on the same chunked lecture input as INSTRUCTKG with DAG constraints enforced. Full adaptation details are provided in Appendix A.

## 4.3 Evaluation Metrics

We evaluate the quality of constructed course knowledge graphs using two excerpt-grounded metrics: *node significance* and *triplet accuracy*. Both metrics are computed using an LLM-based judge constrained to produce structured JSON outputs, grounded on retrieved course excerpts as evidence.

**Node significance** measures whether a concept node represents a core piece of course content aligned with the course learning goals (e.g., key topics, algorithms, or principles), as opposed to logistical items or educational concepts unrelated to the course objectives. Nodes are scored on a strict ordinal scale  $\{0, 1, 2\}$  based on in-context excerpts retrieved for each node, where 0 indicates a non-content or course-irrelevant concept, 1 indicates a plausible but weakly supported or ambiguous concept, and 2 indicates a clearly valid and pedagogically significant course concept.

**Triplet accuracy** evaluates whether a directed, typed edge between two concept nodes correctly captures their conceptual relationship, including both relation type and directionality, using labels depends\_on, part\_of, and None. A score of 2 requires explicit excerpt support for the correct relation and direction, while partial or reversed relationships receive lower scores. Scores are aggregated across nodes and triplets, normalized to  $[0, 1]$ , and reported as mean and standard deviation for each model and extraction method.

### 4.4 Experimental Setup

We evaluate INSTRUCTKG and baselines using three LLMs of varying scale: Llama-3.2-3B-Instruct, Llama-3.1-8B-Instruct [8], and Qwen-2.5-14B-Instruct [26]. For INSTRUCTKG, each model is used consistently across all phases: concept extraction, role classification, and relation judgment. The same models are used for KGGen and EDC to ensure fair comparison. Each configuration is evaluated on all three courses (Database Systems, Natural Language Processing, and Algorithms), with temperature set to 0.1 for all LLM calls to promote deterministic, consistent outputs across extraction and classification phases.

For context clustering, we embed chunks using the *all-MiniLM-L6-v2* sentence transformer model with normalized embeddings. We apply UMAP for dimensionality reduction ( $n_{\text{components}} = 15$ ,  $n_{\text{neighbors}} = 15$ ) followed by HDBSCAN ( $\text{min\_cluster\_size} = 5$ ). All experiments were conducted on NVIDIA H200 GPUs. Full hyperparameter details are provided in Appendix C.

## 5 Experimental Results

We compare INSTRUCTKG against both baselines across all three courses and model scales. Results are evaluated on two dimensions: node-level significance, which measures whether extracted concepts are meaningful to the course, and triplet-level accuracy, which measures whether inferred relationships are pedagogically correct.

**Table 2: Node-level significance and triplet-level accuracy across datasets. Values are reported as mean  $\pm$  standard deviation (%). Bold indicates best;  $^{\dagger}$  indicates second best.**

| Method              | Model    | Algorithms                     |                                | NLP                            |                                | SQL                            |                                |
|---------------------|----------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|--------------------------------|
|                     |          | Node                           | Triplet                        | Node                           | Triplet                        | Node                           | Triplet                        |
| EDC                 | Llama-3B | 43.99 $\pm$ 43.62              | 19.53 $\pm$ 31.50              | 45.08 $\pm$ 45.63              | 13.03 $\pm$ 22.69              | 48.49 $\pm$ 46.88              | 11.25 $\pm$ 23.11              |
|                     | Llama-8B | 50.73 $\pm$ 44.62              | 13.56 $\pm$ 23.21              | 45.55 $\pm$ 46.22              | 14.43 $\pm$ 23.10              | 48.08 $\pm$ 47.19              | 13.16 $\pm$ 22.99              |
|                     | Qwen-14B | 53.44 $\pm$ 43.76              | 17.41 $\pm$ 26.00              | 52.70 $\pm$ 46.24              | 18.35 $\pm$ 24.68              | 53.15 $\pm$ 47.04              | 15.55 $\pm$ 23.71              |
| KG-Gen              | Llama-3B | 43.61 $\pm$ 41.52              | 25.28 $\pm$ 36.13              | 49.65 $\pm$ 45.71              | 35.16 $\pm$ 38.33              | 52.56 $\pm$ 47.22              | 30.85 $\pm$ 39.03              |
|                     | Llama-8B | 52.99 $\pm$ 40.85              | 38.44 $\pm$ 38.41              | 53.38 $\pm$ 45.72              | 38.64 $\pm$ 36.70              | 53.35 $\pm$ 47.25              | 39.97 $\pm$ 38.13              |
|                     | Qwen-14B | 50.90 $\pm$ 42.61              | 41.22 $\pm$ 39.52              | 53.57 $\pm$ 46.24              | 48.29 $\pm$ 37.08              | 58.12 $\pm$ 46.11              | 42.93 $\pm$ 36.87              |
| INSTRUCTKG          | Llama-3B | 93.93 $\pm$ 16.34              | 28.74 $\pm$ 33.29              | 85.66 $\pm$ 28.81              | 36.10 $\pm$ 34.97              | 87.50 $\pm$ 28.89              | 36.20 $\pm$ 35.47              |
|                     | Llama-8B | 93.29 $\pm$ 18.00              | 34.43 $\pm$ 37.06              | 85.21 $\pm$ 27.60              | 47.79 $\pm$ 32.43              | 88.26 $\pm$ 24.07              | 43.38 $\pm$ 32.38              |
|                     | Qwen-14B | <b>97.79</b> $\pm$ 10.27       | <b>48.72</b> $\pm$ 39.04       | 95.63 $\pm$ 16.19              | 57.74 $\pm$ 36.40 $^{\dagger}$ | 94.87 $^{\dagger}$ $\pm$ 18.93 | 57.57 $^{\dagger}$ $\pm$ 35.64 |
| $\times$ Clustering | Llama-3B | 92.92 $\pm$ 18.73              | 37.43 $\pm$ 33.49              | 84.71 $\pm$ 29.35              | 39.97 $\pm$ 35.00              | 87.34 $\pm$ 28.81              | 37.53 $\pm$ 35.36              |
|                     | Llama-8B | 93.29 $\pm$ 18.00              | 35.73 $\pm$ 35.53              | 86.97 $\pm$ 26.94              | 48.73 $\pm$ 30.81              | 87.94 $\pm$ 24.72              | 44.81 $\pm$ 29.26              |
|                     | Qwen-14B | 96.97 $^{\dagger}$ $\pm$ 11.93 | 45.58 $^{\dagger}$ $\pm$ 34.66 | 95.89 $^{\dagger}$ $\pm$ 14.93 | <b>59.10</b> $\pm$ 37.84       | 93.64 $\pm$ 20.35              | <b>59.56</b> $\pm$ 37.98       |
| $\times$ Roles      | Llama-3B | 93.87 $\pm$ 16.40              | 30.01 $\pm$ 33.31              | 85.06 $\pm$ 29.70              | 35.61 $\pm$ 34.25              | 87.05 $\pm$ 29.52              | 36.57 $\pm$ 34.10              |
|                     | Llama-8B | 92.95 $\pm$ 18.34              | 34.94 $\pm$ 37.22              | 85.44 $\pm$ 28.30              | 47.26 $\pm$ 32.67              | 87.45 $\pm$ 25.36              | 43.15 $\pm$ 32.14              |
|                     | Qwen-14B | 93.29 $\pm$ 18.00              | 35.71 $\pm$ 37.19              | <b>95.96</b> $\pm$ 15.74       | 58.49 $^{\dagger}$ $\pm$ 36.32 | <b>95.22</b> $\pm$ 18.62       | 52.88 $\pm$ 36.61              |

## 5.1 Main Results

In our findings we show that InstructKG consistently outperforms both baselines across all datasets and model scales as seen in Table 2. At the node level, the gains are substantial. With Qwen-14B, InstructKG achieves mean node significance scores of 0.978, 0.956, and 0.949 on Algorithms, NLP, and SQL respectively, compared to the strongest baseline (KGGen-14B) at 0.509, 0.536, and 0.581. This represents a relative improvement of 78% on average, indicating that InstructKG consistently extracts concepts that instructors consider meaningful to the course. Even at 3B scale, InstructKG (0.939, 0.857, 0.875) roughly doubles the node significance of both baselines, which remain in the 0.43–0.53 range regardless of model size. This suggests that the quality of extracted concepts is driven primarily by our instructor-grounded pipeline rather than model capacity alone.

For triplet accuracy, InstructKG with Qwen-14B achieves 0.487, 0.577, and 0.576 on Algorithms, NLP, and SQL, which outperforms the best baseline configuration (KGGen-14B: 0.412, 0.483, 0.429) by 18%, 19%, and 34% respectively. At smaller model scales, InstructKG remains competitive with or exceeds KGGen while consistently outperforming EDC, whose triplet accuracy stays below 0.20 across all settings. EDC’s weak triplet performance despite reasonable node scores suggests that its canonicalization-based approach struggles to produce educationally meaningful relationships even when it identifies relevant concepts.

Across all methods, we observe a clear scaling trend: performance generally improves with model size, with the largest gains occurring between 8B and 14B. This trend is most pronounced for InstructKG’s triplet accuracy, where the jump from 8B to 14B yields consistent improvements across all courses (e.g., 0.344 to 0.487 on Algorithms, 0.434 to 0.576 on SQL), suggesting that relation judgment benefits substantially from stronger reasoning capabilities. The two smaller models (3B and 8B) perform relatively

consistently with each other across all methods. Notably, these results hold across courses that differ substantially in format (slides vs. lecture notes), size (9 to 27 lectures), and domain, demonstrating InstructKG’s robustness to varying instructional styles and course structures.

**Ablations.** To isolate the contribution of each component, we conduct three ablations using Qwen-14B: removing thematic clustering (*No Clustering*) and removing pedagogical role classification (*No Roles*). At the node level, all ablations perform comparably to the full method (above 0.93), which is expected since these components primarily affect relationship inference rather than concept extraction.

At the triplet level, the effect of each component varies by course. Removing roles produces the largest accuracy drop on Algorithms (0.357 vs. 0.487), while reintroducing temporal signals alone. Removing clustering slightly reduces accuracy on Algorithms (0.456 vs. 0.487) but marginally improves it on NLP and SQL, indicating that its benefit depends on how concepts are distributed across lecture segments. Overall, role classification provides the most consistent benefit across courses, while clustering and temporal signals offer complementary gains depending on course structure.

### 5.2 Qualitative Case Study

Figures 3 and 4 compare subgraphs from InstructKG and KGGen (both using Qwen-14B) centered on the same concept to illustrate qualitative differences in the extracted relationships. In Figure 3, InstructKG captures that Dynamic Programming and Independent Set are part of Optimization Problem, and that Approximation Problem depends on it, reflecting the pedagogical structure of the Algorithms course. KGGen, by contrast, links Optimization Problem to surface-level terms like "Instant I" and "OPT I," which are variable names from lecture examples rather than meaningful

**Table 3: SQL Question–Concept Mapping. Red indicates error-related concepts. Dependency order: ORDER BY → WHERE → FROM.**

| Q1                                                                                                                                                                                                                                                                                                                                 | Q2                                                                                                                                                                                                          | Q3                                                                                                                                                                                                               |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| <b>Question.</b> Resources NOT accessed by users in Segment A. Average duration per resource.<br><br><b>Buggy solution:</b><br><pre>SELECT ResourceId, AVG(Duration) AS AvgDur FROM AccessLog WHERE EXISTS (   SELECT 1   FROM UserProfile U   WHERE U.UserId = AccessLog.UserId   AND U.Segment = 'A' ) GROUP BY ResourceId</pre> | <b>Question.</b> List open tickets, sorted by most recently updated first.<br><br><b>Buggy solution:</b><br><pre>SELECT TicketId, UpdatedAt FROM Tickets WHERE Status = 'Open' ORDER BY UpdatedAt ASC</pre> | <b>Question.</b> Total hours per project (must use time logs as the source table).<br><br><b>Buggy solution:</b><br><pre>SELECT ProjectId, SUM(Hours) AS TotalHours FROM ProjectMembers GROUP BY ProjectId</pre> |
| <b>Bug:</b> Opposite logic (EXISTS instead of NOT EXISTS)                                                                                                                                                                                                                                                                          | <b>Bug:</b> Wrong sort direction (should be DESC)                                                                                                                                                           | <b>Bug:</b> Wrong source table (should use TimeLogs)                                                                                                                                                             |
| <b>Error concept:</b> <b>WHERE</b>                                                                                                                                                                                                                                                                                                 | <b>Error concept:</b> <b>ORDER BY</b>                                                                                                                                                                       | <b>Error concept:</b> <b>FROM</b>                                                                                                                                                                                |

![Figure 3: Comparison of knowledge graph outputs. Left: 'Ours' graph showing 'Optimization Problem' as a central node with edges to 'Approximation Problem' (DEPENDS_ON), 'Independent Set' (PART_OF), and 'Dynamic Programming' (PART_OF). Right: 'KGGen' graph showing 'Optimization Problem' as a central node with edges to 'Minimization Problem' (PART_OF), 'OPT I' (PART_OF), and 'Instant I' (PART_OF).](997233d405f0d4b89ddeb7683e047f66_img.jpg)

Figure 3: Comparison of knowledge graph outputs. Left: 'Ours' graph showing 'Optimization Problem' as a central node with edges to 'Approximation Problem' (DEPENDS\_ON), 'Independent Set' (PART\_OF), and 'Dynamic Programming' (PART\_OF). Right: 'KGGen' graph showing 'Optimization Problem' as a central node with edges to 'Minimization Problem' (PART\_OF), 'OPT I' (PART\_OF), and 'Instant I' (PART\_OF).

**Figure 3: Comparison of knowledge graph outputs: ours (left) vs. KGGen (right).**![Figure 4: Comparison of knowledge graph outputs. Left: 'Ours' graph showing 'Foreign Key' as a central node with edges to 'Primary Key' (DEPENDS_ON), 'Schema Specifications' (PART_OF), and 'Referential Integrity' (PART_OF). Right: 'KGGen' graph showing 'Foreign Key' as a central node with edges to 'The key for the referring table' (PART_OF), 'Attribute' (PART_OF), and 'Constraint' (PART_OF).](d793cf7c174b89eb024d132f00679787_img.jpg)

Figure 4: Comparison of knowledge graph outputs. Left: 'Ours' graph showing 'Foreign Key' as a central node with edges to 'Primary Key' (DEPENDS\_ON), 'Schema Specifications' (PART\_OF), and 'Referential Integrity' (PART\_OF). Right: 'KGGen' graph showing 'Foreign Key' as a central node with edges to 'The key for the referring table' (PART\_OF), 'Attribute' (PART\_OF), and 'Constraint' (PART\_OF).

**Figure 4: Comparison of knowledge graph outputs: ours (left) vs. KGGen (right).**

course concepts. This explains a recurring pattern: without role classification, text-based methods extract tokens that co-occur with a concept but carry no pedagogical significance. In Figure 4, INSTRUCTKG captures that FOREIGN KEY depends on PRIMARY KEY, that SCHEMA SPECIFICATION is part of FOREIGN KEY, and that FOREIGN KEY is part of REFERENTIAL INTEGRITY, a coherent fragment of the database course’s prerequisite structure. KGGen instead links FOREIGN KEY to broader terms like “attribute” and “constraint”, related but not reflective of the course’s intended learning progression.

### 5.3 Human Evaluation

Two human evaluators with expertise in SQL and Algorithms, reviewed 20 randomly sampled concept nodes and relation triplets from the Database Systems & Algorithms courses, respectively. The SQL evaluator judged 90.0% of nodes and 75.0% of triplets as overall correct. Specifically, the average score was 1.65/2.00 across both metrics, with 14/20 being fully correct (a score of 2) and 19/20 being acceptable (a score  $\geq 1$ ). For Algorithms, the evaluator judged 100%

of nodes and triplets as overall correct, with 20/20 nodes and 14/20 triplets being fully correct.

### 5.4 Student Mapping

To illustrate a downstream application of INSTRUCTKG, we demonstrate how the constructed knowledge graph can be used to map student errors to specific concept gaps. Given a set of SQL problems from a real university course and synthetically generated student submissions, we first tag each question to the relevant concepts in the knowledge graph using embedding-based candidate selection followed by LLM-based concept assignment. We then compare each student’s submission against the expected solution to identify errors, and trace those errors back to the tagged concepts in the graph. Table 3 shows an example from the Database Systems course. Three SQL questions (Q1, Q2, Q3) are mapped to knowledge graph concepts such as ORDER BY, WHERE, and FROM CLAUSE (shown in yellow). Each question is linked to student submissions (S1, S2, S3), and errors in those submissions are traced back via the graph edges (shown as red dashed lines) to the concepts where the student’s understanding likely broke down. For instance, a student who writes an incorrect WHERE clause in Q1 can be linked through the graph’s dependency structure to identify that FROM CLAUSE - a prerequisite of WHERE - may also need reinforcement. This demonstrates how INSTRUCTKG’s dependency edges enable targeted diagnostics: rather than simply flagging an incorrect answer, the graph reveals which foundational concepts may underlie the error.

## 6 Discussion

The experimental results confirm that grounding knowledge graph construction in instructor-provided signals leads to substantially more accurate and pedagogically meaningful outputs than methods relying on LLM parametric knowledge alone. Both baselines have access to the same text and models, yet consistently produce lower-quality concepts and less accurate relationships. The gap is most pronounced at the node level, where INSTRUCTKG achieves significance scores above 0.93 even at 3B scale, while baselines remain below 0.58 regardless of model size. This suggests that the quality of extracted concepts is determined more by how the extraction is structured than by how powerful the underlying model is. Role

classification guides the LLM toward concepts that are meaningful within the course, rather than surface-level tokens or variable names that happen to co-occur frequently in lecture text, a failure mode clearly visible in the qualitative comparisons of Figures 3 and 4.

The ablation results reveal that no single component is universally dominant; rather, the components provide complementary benefits whose relative importance depends on course structure. Removing role classification produces the largest accuracy drop on Algorithms, where concepts such as DYNAMIC PROGRAMMING and GREEDY ALGORITHMS serve distinct pedagogical functions that are critical for authorize dependency direction. On NLP and SQL, removing clustering or roles has a more modest effect, suggesting that denser chunk-level co-occurrence patterns partially compensate for missing global signals. The observation that temporal signals alone recover much of the full method’s accuracy on Algorithms highlights teaching order as a robust, low-cost signal for prerequisite inference, particularly in courses with a linear topic progression.

Several limitations should be acknowledged. Our evaluation spans three computer science courses from public universities, and while these courses vary in format, scale, and domain, generalization to disciplines outside computer science remains an open question. The relation schema is restricted to two types (depends\_on and part\_of), which might not encompass the full range of relationships relevant for other applications. Finally, while we evaluate with three open-source LLMs, the largest model used (Qwen-2.5-14B) is modest by current standards, and performance with larger models remains unexplored.

## 7 Conclusion

We presented INSTRUCTKG, a framework for automatically constructing knowledge graphs from course materials that capture instructor-aligned learning progressions. By leveraging signals unique to educational materials, specifically the temporal ordering of instruction and the pedagogical roles concepts play across lecture segments, INSTRUCTKG infers prerequisite and compositional relationships that reflect the intended structure of a course. Experiments on three real-world courses demonstrate consistent improvements over two recent LLM-based knowledge graph construction methods, with node significance scores above 0.94 and triplet accuracy gains of 18 to 34 percent over the strongest baseline. We also demonstrated how the constructed graphs can trace student errors to specific concept gaps, illustrating their potential for personalized learning diagnostics. Future work will explore extending the relation schema, evaluating across disciplines and institutions, and integrating the constructed graphs with real student assessment data to enable targeted learning interventions at scale.

## Acknowledgments

This work was supported in part by the Strategic Instructional Innovations Program (SIIP) and the KERN Family Foundation. We gratefully acknowledge their support.

## References

- [1] Qurat Ul Ain, Mohamed Amine Chatti, Komlan Gluck Charles Bakar, Shoeb Joarder, and Rawaa Alatrash. 2023. Automatic construction of educational knowledge graphs: a word embedding-based approach. *Information* 14, 10 (2023), 526.
- [2] Fareedah ALSaad and Abdussalam Alawini. 2020. Unsupervised Approach for Modeling Content Structures of MOOCs. *International Educational Data Mining Society* (2020).
- [3] Fareedah ALSaad, Thomas Reichel, Yuchen Zeng, and Abdussalam Alawini. 2021. Topic Transitions in MOOCs: An Analysis Study. *International Educational Data Mining Society* (2021).
- [4] Mehmet Cem Aytekin, Yücel Saygın, et al. 2024. ACE: AI-assisted construction of educational knowledge graphs with prerequisite relations. *Journal of Educational Data Mining* 16, 2 (2024), 85–114.
- [5] Zhen Bi, Jing Chen, Yinuo Jiang, Feiyu Xiong, Wei Guo, Huajun Chen, and Ningyu Zhang. 2024. Codekgc: Code language model for generative knowledge graph construction. *ACM Transactions on Asian and Low-Resource Language Information Processing* 23, 3 (2024), 1–16.
- [6] Abdessamad Chanaa and Nour-eddine El Faddouli. 2024. Prerequisites-based course recommendation: Recommending learning objects using concept prerequisites and metadata matching. *Smart Learning Environments* 11, 1 (2024), 16.
- [7] Sankalan Pal Chowdhury, Nico Daheim, Ekaterina Kochmar, Jakub Macina, Donya Rooein, Mrinmaya Sachan, and Shashank Sonkar. 2025. Large Language Models for Education: Understanding the Needs of Stakeholders, Current Capabilities and the Path Forward. In *PROCEEDINGS OF THE 20TH WORKSHOP ON INNOVATIVE USE OF NLP FOR BUILDING EDUCATIONAL APPLICATIONS, BEA 2025*. 1–10.
- [8] Abhimanyu Dubey, Abhinav Jauhri, Abhinav Pandey, Abhishek Kadian, Ahmad Al-Dahle, Aiesha Letman, Akhil Mathur, Alan Schelten, Amy Yang, Angela Fan, et al. 2024. The llama 3 herd of models. *arXiv e-prints* (2024), arXiv:2407.
- [9] Markus Eberts and Adrian Ulges. 2019. Span-based joint entity and relation extraction with transformer pre-training. *arXiv preprint arXiv:1909.07755* (2019).
- [10] Haoyu Huang, Chong Chen, Zeang Sheng, Yang Li, and Wentao Zhang. 2025. Can LLMs be Good Graph Judge for Knowledge Graph Construction?. In *Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing*. 10940–10959.
- [11] Jingxiu Huang, Ruofei Ding, Xiaomin Wu, Shumin Chen, Jiale Zhang, Lixiang Liu, and Yunxiang Zheng. 2023. WERECE: An Unsupervised Method for Educational Concept Extraction Based on Word Embedding Refinement. *Applied Sciences* 13, 22 (2023), 12307.
- [12] Yizhu Jiao, Ming Zhong, Sha Li, Ruining Zhao, Siru Ouyang, Heng Ji, and Jiawei Han. 2023. Instruct and extract: Instruction tuning for on-demand information extraction. *arXiv preprint arXiv:2310.16040* (2023).
- [13] Martin Josifoski, Nicola De Cao, Maxime Peyrard, Fabio Petroni, and Robert West. 2022. GenIE: Generative information extraction. In *Proceedings of the 2022 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies*. 4626–4643.
- [14] Keshav Kolluru, Vaibhav Adlakha, Samarth Aggarwal, Soumen Chakrabarti, et al. 2020. Openie6: Iterative grid labeling and coordination analysis for open information extraction. *arXiv preprint arXiv:2010.03147* (2020).
- [15] Ying Lin, Heng Ji, Fei Huang, and Lingfei Wu. 2020. A joint neural model for information extraction with global features. In *Proceedings of the 58th annual meeting of the association for computational linguistics*. 7999–8009.
- [16] Mengying Lu, Yuquan Wang, Jifan Yu, Yexing Du, Lei Hou, and Juanzi Li. 2023. Distantly supervised course concept extraction in MOOCs with academic discipline. In *Proceedings of the 61st annual meeting of the association for computational linguistics (Volume 1: Long Papers)*. 13044–13059.
- [17] Belinda Mo, Kyssen Yu, Joshua Kazdan, Joan Cabezas, Proud Mpala, Lisa Yu, Chris Cundy, Charilaos Kanatsoulis, and Sanmi Koyejo. 2025. Kggen: Extracting knowledge graphs from plain text with language models. *arXiv preprint arXiv:2502.09956* (2025).
- [18] Bianca A Simonsmeier, Maja Flaig, Anne Deiglmayr, Lennart Schalk, and Michael Schneider. 2022. Domain-specific prior knowledge and learning: A meta-analysis. *Educational psychologist* 57, 1 (2022), 31–54.
- [19] Sander Valstar, William G Griswold, and Leo Porter. 2019. The relationship between prerequisite proficiency and student performance in an upper-division computing course. In *Proceedings of the 50th ACM Technical Symposium on Computer Science Education*. 794–800.
- [20] David Wadden, Ulme Wennberg, Yi Luan, and Hannaneh Hajishirzi. 2019. Entity, relation, and event extraction with contextualized span representations. *arXiv preprint arXiv:1909.03546* (2019).
- [21] Qingwang Wang, Chaohui Li, Yi Liu, Qiubai Zhu, Jian Song, and Tao Shen. 2025. An Adaptive Framework Embedded with LLM for Knowledge Graph Construction. *IEEE Transactions on Multimedia* (2025).
- [22] X Wang, W Zhou, C Zu, H Xia, T Chen, Y Zhang, R Zheng, J Ye, Q Zhang, T Gui, et al. 2023. Instructuie: Multi-task instruction tuning for unified information extraction. *arxiv* 2023. *arXiv preprint arXiv:2304.08085* (2023).
- [23] Yucheng Wang, Bowen Yu, Yueyang Zhang, Tingwen Liu, Hongsong Zhu, and Limin Sun. 2020. TPLinker: Single-stage joint extraction of entities and relations through token pair linking. *arXiv preprint arXiv:2010.13415* (2020).
- [24] Zhichun Wang, Yifeng Shao, Boci Peng, Bangui Li, Yun Li, Qianren Wang, and Nijun Li. 2024. Multi-view Transformer-Based Network for Prerequisite Learning

- in Concept Graphs. In *International Semantic Web Conference*. Springer, 67–86.
- [25] Victor Eiti Yamamoto, Othmane Kabal, Lakshan Karunathilake, Kotaro Nishigori, Vicente Lermada, Shixiong Zhao, Hiroki Uematsu, Yanming He, and Hideaki Takeda. 2025. Exploring LLM To Extract Knowledge Graph From Academic Abstracts. (2025).
- [26] An Yang, Anfeng Li, Baosong Yang, Beichen Zhang, Binyuan Hui, Bo Zheng, Bowen Yu, Chang Gao, Chengen Huang, Chenxu Lv, et al. 2025. Qwen3 technical report. *arXiv preprint arXiv:2505.09388* (2025).
- [27] Deming Ye, Yankai Lin, Peng Li, and Maosong Sun. 2022. Packed levitated marker for entity and relation extraction. In *Proceedings of the 60th annual meeting of the association for computational linguistics (volume 1: long papers)*. 4904–4917.
- [28] Bowen Zhang and Harold Soh. 2024. Extract, define, canonicalize: An llm-based framework for knowledge graph construction. *arXiv preprint arXiv:2404.03868* (2024).
- [29] Jian Zhang, Bifan Wei, Shihao Qi, Jun Liu, Qika Lin, et al. 2025. GKG-LLM: A Unified Framework for Generalized Knowledge Graph Construction. *arXiv preprint arXiv:2503.11227* (2025).
- [30] Bowen Zhao, Jiuding Sun, Bin Xu, Xingyu Lu, Yuchen Li, Jifan Yu, Minghui Liu, Tingjian Zhang, Qiuyang Chen, Hanming Li, et al. 2022. EDUKG: a heterogeneous sustainable k-12 educational knowledge graph. *arXiv preprint arXiv:2210.12228* (2022).
- [31] Zexuan Zhong and Danqi Chen. 2021. A frustratingly easy approach for entity and relation extraction. In *Proceedings of the 2021 conference of the North American chapter of the association for computational linguistics: human language technologies*. 50–61.

## A Baselines Details

We compare INSTRUCTKG against two recent LLM-based knowledge graph construction methods, adapting each to our target schema and input format for fair comparison.

**KGGen.** A multi-stage text-to-KG generator that extracts subject–predicate–object triples from plain text, then clusters and de-duplicates entities and edges using embedding similarity and LLM-based resolution [17]. KGGen extracts unconstrained predicates, which we map to our target relations (`depends_on`, `part_of`) using semantic similarity: we embed the extracted predicate and compare it against reference examples for each relation type (e.g., “requires,” “prerequisite for” for `depends_on`; “component of,” “subset of” for `part_of`), retaining only edges that exceed a similarity threshold. We apply the same chunked lecture input and enforce DAG constraints via cycle detection to ensure fair comparison.

**EDC.** A three-phase LLM-based framework (Extract, Define, Canonicalize) that performs open triplet extraction, generates definitions for induced schema elements, and canonicalizes relations via embedding retrieval and LLM verification [28]. We provide EDC with a target schema containing our two relation types with definitions (e.g., “`depends_on`: *A* requires *B* as prerequisite; `part_of`: *A* is a component or subset of *B*”) and run the full pipeline on the same chunked lecture input. We apply global deduplication and DAG enforcement to the output for consistency.

Both baselines operate on the same lecture chunks as INSTRUCTKG but do not leverage pedagogical signals such as teaching order, concept roles, or cross-chunk thematic clustering. This comparison isolates the contribution of our instructor-aligned evidence aggregation and relation judgment approach.

## B Prompt Templates

### Node Significance Evaluation Prompt

You are evaluating a single concept node extracted for a  
↔ course knowledge graph.

Course Title: {course\_name}

Goal:

Decide whether the node is a SIGNIFICANT course-content concept: something students should be taught and should understand/use  
↔ in this course.

Important:

- "Significant concept" means key educational concepts (topic, ↔ method, principle, theorem, algorithm, framework, key technical term) for a course.
- It does NOT mean logistics/admin/metadata (e.g., instructor ↔ name, due dates, office hours, grading policy, LMS/Canvas, Zoom link).
- It does NOT mean educational concepts that would typically ↔ fall under a different course/topic (e.g., "Constitution", ↔ mentioned in an example of text parsing, would NOT be a ↔ significant concept for an NLP course.)

Concept Node:

- A = "{node\_label}"

Use the following 0-2 ordinal scale strictly (Concept Node

↔ significance/validity):

Definitions:

- "Significant/meaningful concept" = a critical educational  
↔ concept that students should be taught and be able to explain/use in this course (core  
↔ topic, method, principle, model, theorem, algorithm, technique, framework, key  
↔ term).
- "Not meaningful for the course" includes  
↔ logistical/admin/metadata items that do not represent course content knowledge.

Clear examples:

- Meaningful (YES / likely 2 if supported): "recursion",  
↔ "merge sort", "Bayes' theorem", "photosynthesis", "supply and demand", "gradient descent",  
↔ "constitutional amendments".
- Not meaningful (NO / likely 0 even if mentioned):  
↔ instructor/TA names, office hours, due dates, grading policy, course number, Zoom link,  
↔ classroom location, required textbook ISBN, "homework submission", "attendance", "Canvas", "midterm".

Scoring:

- 0 = Invalid OR not a course-content concept  
↔ (logistics/metadata), OR clearly insignificant or  
↔ unrelated to course learning goals.
- 1 = Plausible course-content concept but weakly supported,  
↔ too vague, overly broad, or ambiguous given excerpts.  
(Use 1 when you cannot confirm significance from the  
↔ excerpts.)
- 2 = Clearly a valid course-content concept AND clearly  
↔ significant for the course, with strong excerpt support.

Evidence policy:

- Base your score ONLY on the provided excerpts and the node  
↔ label.
- If evidence is insufficient/ambiguous, score 1 and state  
↔ what is missing.
- Cite evidence by excerpt\_id (avoid long quotations).

Instructor-material excerpts (evidence base):

[formatted excerpts here]

Requirements for your answer:

- Output STRICT JSON only (no markdown).
- Rationale must cite excerpt\_id(s) as evidence (e.g., "[1]", "↔ [3]").
- If evidence is insufficient or ambiguous, score 1 and say ↔ what is missing.

Output format (STRICT JSON, no markdown, no trailing

```
↔ commentary):
{
  "score": <integer in the required range>,
  "rationale": "<2-6 sentences; must reference
  ↳ excerpt_ids as evidence>",
  "evidence": ["<excerpt_id>", "..."],
  "notes": ["<optional brief note>", "..."]
}
```

### Triplet Accuracy Evaluation Prompt

You are evaluating a single directed typed edge (concept  
↔ triplet) in a course knowledge graph.

Task:  
Score whether the edge type and direction accurately  
↔ reflect the conceptual relationship  
between the two concepts, based strictly on the  
↔ instructor-provided excerpts.

Course Title: {course\_name}

Concept Triplet:  
- A = "{edge['source']}"  
- relation = "{edge['relation\_type']}" (allowed:  
↔ depends\_on, part\_of)  
- B = "{edge['target']}"

Interpreting relation types:  
- depends\_on: B is a prerequisite of A (B should be  
↔ learned before A)  
- part\_of: B is a subtopic/component of A (A  
↔ contains/organizes B)

Use the following 0-2 ordinal scale strictly (Directed,  
↔ typed edge accuracy):

You must judge TWO things:

- (1) Whether A and B are directly related as course concepts,  
↔ AND
- (2) Whether the relation TYPE AND DIRECTION are correct.

The options for relation types are: depends\_on, part\_of,  
↔ and None.

If A and B should NOT be directly related, then the proposed  
↔ relationship should be "None" (e.g., "mergesort",  
↔ "machine learning" should not be directly related).

Relation semantics (direction matters):  
- depends\_on: Comprehending A requires understanding B; B  
↔ is a prerequisite of A. Students should  
↔ learn/understand B BEFORE A.  
(Read as: A depends\_on B.)  
- part\_of: A is a subtopic/component of B. B  
↔ contains/organizes A.  
(Read as: A is part\_of B.)

Clear examples (directional):

- Correct depends\_on:  
A="merge sort" depends\_on B="recursion": CORRECT (merge  
↔ sort relies on recursion ideas)  
A="backpropagation" depends\_on B="chain rule": CORRECT
- Incorrect depends\_on (reversed):

A="recursion" depends\_on B="merge sort": WRONG (direction  
↔ reversed; recursion is more fundamental)

- Correct part\_of:  
A="merge sort" part\_of B="sorting algorithms" and  
↔ relation part\_of where A part\_of B: CORRECT  
A="mitochondria" with B="cell" and relation part\_of where  
↔ A part\_of B: CORRECT
- Incorrect part\_of (reversed):  
A="sorting algorithms" part\_of B="merge sort": WRONG

Scoring:

- 0 = No: the proposed direct relationship is wrong OR not  
↔ supported by excerpts.
- 1 = Somewhat: A and B are related, but the type and/or the  
↔ direction is wrong or unclear from evidence.
- 2 = Yes: A and B are directly related AND the type AND  
↔ direction match the excerpts.

Evidence policy:

- Base your score ONLY on the provided excerpts and the  
↔ proposed edge.
- If evidence is insufficient/ambiguous, score 1 and state  
↔ what is missing.
- Cite evidence by excerpt\_id (avoid long quotations).

Instructor-material excerpts (evidence base):  
[formatted excerpts]

Output format (STRICT JSON, no markdown, no trailing  
↔ commentary):

```
{
  "score": <integer in the required range>,
  "rationale": "<2-6 sentences; must reference
  ↳ excerpt_ids as evidence>",
  "evidence": ["<excerpt_id>", "..."],
  "notes": ["<optional brief note>", "..."]
}
```

### Relation Judge Prompt

You are an expert course instructor building a concept  
↔ hierarchy for a university course.

TASK:

- Use ONLY these relations: ["depends\_on", "part\_of"].
  - For this ordered pair (A,B), choose the MOST DOMINANT  
↔ relation if any exists.
  - \*\*CRITICAL\*\*: The relation direction is ALWAYS from A to B (A  
↔ -> B). Do NOT reverse the direction.
  - Dominance rules: prefer the single relation that best  
↔ supports learning order and course understanding.
  - Be minimal: avoid drawing edges just because they are  
↔ possible. Only include edges that are clearly supported.
  - If two relations both plausibly hold, output the dominant one  
↔ only; output the other ONLY if strongly justified (lower  
↔ confidence).
  - You can skip making a relationship if there is no clear  
↔ relation.
- CAUTION: Never make a relationship between concepts that have  
↔ no clear connection.

Definitions:

- Concept: a distinct course idea/skill/topic.
- Role: how a concept appears in a passage.
  - Definition = the passage defines/explains/introduces the  
↔ concept.
  - Example = the passage demonstrates the concept via a  
↔ concrete instance/walkthrough.
  - Assumption = the passage uses the concept as prior  
↔ knowledge without teaching it.

RELATION DEFINITIONS & EXAMPLES (direction is ALWAYS  $A \rightarrow B$ ):

- "depends\_on": A depends\_on B means A requires B as a prerequisite (B must be learned BEFORE A).  
 $\hookrightarrow$  prerequisite (B must be learned BEFORE A).  
**\*\*Direction\*\*:**  $A \rightarrow B$  means "A requires B first"  
 Examples:  
 - "gradient descent" depends\_on "derivatives"  
 $\rightarrow$  gradient descent (A) requires derivatives (B) as  
 $\hookrightarrow$  prerequisite  
 - "backpropagation" depends\_on "chain rule"  
 $\rightarrow$  backpropagation (A) requires chain rule (B) as  
 $\hookrightarrow$  prerequisite  
 - "ANOVA" depends\_on "variance"  
 $\rightarrow$  ANOVA (A) requires variance (B) as prerequisite  
  
**\*\*WRONG examples (these would be backwards)\*\*:**  
 - DO NOT say "derivatives" depends\_on "gradient descent"  
 $\hookrightarrow$  (this is reversed!)  
 - DO NOT say B depends\_on A when A actually needs B first
- "part\_of": A part\_of B means A is a component/subtype/member  
 $\hookrightarrow$  of the broader concept B.  
**\*\*Direction\*\*:**  $A \rightarrow B$  means "A is part of B" (A is the  
 $\hookrightarrow$  specific, B is the general)  
 Examples:  
 - "convolutional layer" part\_of "neural networks"  
 $\rightarrow$  convolutional layer (A) is a component of neural  
 $\hookrightarrow$  networks (B)  
 - "t-test" part\_of "hypothesis testing"  
 $\rightarrow$  t-test (A) is a specific type within hypothesis testing  
 $\hookrightarrow$  (B)  
 - "supervised learning" part\_of "machine learning"  
 $\rightarrow$  supervised learning (A) is a subcategory of machine  
 $\hookrightarrow$  learning (B)  
  
**\*\*WRONG examples (these would be backwards)\*\*:**  
 - DO NOT say "neural networks" part\_of "convolutional layer"  
 $\hookrightarrow$  (this is reversed!)  
 - DO NOT say B part\_of A when A is actually the specific case  
 $\hookrightarrow$  of B

PAIR:  
 A = "{A}"  
 B = "{B}"

ROLES:  
 {ROLE\_BLOCK}

TEMPORAL / STATS:  
 {TEMPORAL\_BLOCK}

EVIDENCE\_MODE:  
 {MODE\_BLOCK}

RULES FOR USING THE EVIDENCE TEXT: - Base your decision ONLY on  
 $\hookrightarrow$  the text shown in EVIDENCE below. - The EVIDENCE text is  
 $\hookrightarrow$  the supporting passages for this (A,B) pair. - If the text  
 $\hookrightarrow$  does not clearly support a relation, output null. - Your  
 $\hookrightarrow$  returned evidence[].quote MUST be an exact substring copied  
 $\hookrightarrow$  from the provided text.

EVIDENCE (use ONLY what is shown below; do not assume anything  
 $\hookrightarrow$  unstated):  
 {EVIDENCE\_BLOCK}

Return strict JSON ONLY (no markdown, no extra text):

```
{
  "A": "{A}",
  "B": "{B}",
  "relation": "depends_on" | "part_of" | null,
  "confidence": 0.0,
  "justification": "1-3 sentences grounded in the evidence
 $\hookrightarrow$  above",
  "evidence": [
```

```
{
  "type": "chunk" | "cluster", "chunk_id": "...",
  "lecture_id": "...", "page_numbers": [1,2], "quote":
 $\hookrightarrow$  "..."}
}
```

### Concept Extraction Prompt

You are an instructor that extracts learning concepts from text.

- Concept: a core idea or topic about the subject matter. Only  
 $\hookrightarrow$  extract meaningful course concepts.  
 DO NOT extract example values, variable names, numbers,  
 $\hookrightarrow$  formulas, or code elements.  
 Ignore content inside examples, formulas.

Return strict JSON:  
 { "concepts": ["..."] }

- Rules:
- 1-5 words per concept
  - No code tokens, variable names, numbers, example values
  - Deduplicate

### Role Classification Prompt

You will be given a text chunk from university lecture notes or  
 $\hookrightarrow$  slides and a concept from the course.  
 Classify the role the concept plays in this chunk into one of  
 $\hookrightarrow$  four categories:

- 1\*\*Definition\*\*:** The concept is being defined, explained, or  
 $\hookrightarrow$  introduced. The text describes what the concept is, its  
 $\hookrightarrow$  properties, or how it works.  
 Simple example: "Binary search is an algorithm that finds an  
 $\hookrightarrow$  element in a sorted array by repeatedly dividing the search  
 $\hookrightarrow$  interval in half."  
 Complex example:  
 - Concept: "Big O notation"  
 - Text: "When analyzing algorithm efficiency, we need a formal  
 $\hookrightarrow$  way to describe performance. Big O notation provides an  
 $\hookrightarrow$  upper bound on the growth rate of an algorithm's time  
 $\hookrightarrow$  complexity, expressing how runtime scales with input size  
 $\hookrightarrow$  n."  
 - Classification: Definition (the concept itself is being  
 $\hookrightarrow$  explained, even when embedded in broader context)

- 2\*\*Example\*\*:** The concept is being demonstrated or illustrated  
 $\hookrightarrow$  through a concrete example, walkthrough, or application.  
 $\hookrightarrow$  The text shows the concept in action.  
 Simple example: "Let's apply binary search to find 7 in  
 $\hookrightarrow$  [1,3,5,7,9,11]: First, check the middle element 5..."  
 Complex example:  
 - Concept: "Recursion"  
 - Text: "To understand how the call stack works, consider  
 $\hookrightarrow$  computing factorial(3). The function calls factorial(2),  
 $\hookrightarrow$  which calls factorial(1), which calls factorial(0)  
 $\hookrightarrow$  returning 1. Then factorial(1) returns 1x1=1, factorial(2)  
 $\hookrightarrow$  returns 2x1=2, and finally factorial(3) returns 3x2=6."  
 - Classification: Example (shows recursion through a concrete  
 $\hookrightarrow$  walkthrough, even if framed as explanation)

- 3\*\*Assumption\*\*:** The concept is being used as prior knowledge,  
 $\hookrightarrow$  a prerequisite, or a foundation for explaining something  
 $\hookrightarrow$  else. The text assumes familiarity with the concept to  
 $\hookrightarrow$  build further understanding.  
 Simple example: "Using binary search, we can now efficiently  
 $\hookrightarrow$  implement the dictionary lookup feature..."

```
Complex example:
- Concept: "Hash functions"
- Text: "Hash tables achieve O(1) average-case lookup because
  ↳ hash functions distribute keys uniformly across buckets.
  ↳ However, we must handle collisions when multiple keys map
  ↳ to the same index."
- Classification: Assumption (hash functions are used as known
  ↳ background to explain hash table behavior)

4** NA **: The concept does not fall under any of the above
↳ mentioned roles: (Definition, Example, Assumption).

**Key distinction**: If the concept is being taught ->
↳ Definition. If it's being shown in action -> Example. If
↳ it's being used to explain something else -> Assumption. If
↳ none of the previously mentioned then -> NA

Also return an evidence snippet:
- Must be an exact substring copied from the chunk (10-30 words)
- Should best support your classification
- Keep it concise and relevant

Return strict JSON format only:
{ "role": "Definition" | "Example" | "Assumption" | "NA",
  ↳ "snippet": "..." }
```

## C Hyperparameter Details

Table 4: Hyperparameters used across all pipeline components.

| Component          | Parameter                           | Value                  |
|--------------------|-------------------------------------|------------------------|
| Document Ingestion | Max tokens per chunk                | 8191                   |
|                    | Merge peers                         | True                   |
| Concept Extraction | Concepts per chunk                  | 1–5 words              |
|                    | Deduplication                       | Case-insensitive       |
| Context Clustering | Embedding model                     | all-MiniLM-L6-v2       |
|                    | UMAP <i>n</i> <sub>components</sub> | 15                     |
|                    | UMAP <i>n</i> <sub>neighbors</sub>  | 15                     |
|                    | HDBSCAN <i>min_cluster_size</i>     | 5                      |
| Evidence Selection | Max evidence chunks per pair        | 3                      |
|                    | Max clusters per pair               | 1                      |
|                    | Relation batch size                 | 8                      |
| LLM Inference      | Temperature                         | 0.1                    |
|                    | Concurrency                         | 5                      |
| Student Mapping    | Tagging model                       | GPT-4o-mini            |
|                    | Embedding model                     | text-embedding-3-small |
|                    | Candidate pool size                 | 60                     |
|                    | Min confidence                      | 0.70                   |