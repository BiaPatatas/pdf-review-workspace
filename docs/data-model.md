# Data Model & Retrieval Design

## Entity-Relationship Diagram

```mermaid
erDiagram
    DocumentIndex ||--|{ IndexedPassage : contains
    IndexedPassage ||--o| TableMeta : "describes (table_cell)"
    IndexedPassage ||--o{ TrackedChange : anchors
    IndexedPassage ||--o{ Suggestion : targets
    Suggestion ||--o| TrackedChange : "produces (after human approval)"
    IndexedPassage ||--o{ ModelContextPackage : "scoped target"
    TrackedChange }o--o{ ModelContextPackage : "Accepted edits only"

    DocumentIndex {
        string documentId PK
        string title
        string sourceFile
        int pageCount
        string[] excludedRegions
    }

    IndexedPassage {
        string id PK
        int page
        string section
        enum blockType "heading | paragraph | list_item | table_cell | protected_legal"
        string text
        boolean editable
        string lockReason "optional"
        string prevPassageId FK "nullable"
        string nextPassageId FK "nullable"
    }

    TableMeta {
        string tableId
        int row
        int column
        string columnHeader "optional"
    }

    TrackedChange {
        string id PK
        string passageId FK
        int page
        string section
        string originalText
        string proposedText "empty string = deletion"
        string originalHtml "DOMPurify sanitized"
        string proposedHtml "DOMPurify sanitized"
        boolean formattingOnly
        enum status "Pending | Accepted | Rejected"
        string author
        datetime createdAt
        datetime updatedAt
        string comment "optional plain text"
        string commentHtml "optional sanitized HTML"
        enum source "manual | suggestion"
        string suggestionId FK "optional"
    }

    Suggestion {
        string id PK
        string passageId FK
        int page
        string section
        enum category "grammar | syntax | style"
        enum origin "mock_sample | live_model"
        string originalText
        string proposedText
        string proposedHtml "untrusted until sanitized"
        string rationale
        boolean requiresHumanApproval "literal true"
    }

    ModelContextPackage {
        string schemaVersion "1.0"
        string documentId
        int page
        string section
        object targetPassage "includes optional tableMeta"
        object surroundingContext "before[] / after[] in same section"
        object[] relatedAcceptedEdits "Accepted changes in window"
        object security "untrustedDataBoundary + promptInjectionDetected"
        string systemInstruction
    }