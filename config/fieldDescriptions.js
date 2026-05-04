// Single source of truth for field-level help text shown by the info icons in
// the create/edit modals. Edit here to update both the references and sources
// admin UI. Plain text only — keep entries short enough to read in a popover.
module.exports = {
    refs: {
        author: "The author or authors credited on the work, in First Last order. For multiple authors, separate with commas. Do not include titles or degrees. If only initials given, include periods (e.g. \"J. D. Smith,\").",
        title: "The full title of the work, exactly as it appears on the source.",
        date: "Publication date in ISO 8601 format (YYYY, YYYY-MM, or YYYY-MM-DD). The year drives the date-boost relevance ranking; reduced precision is allowed.",
        reference: "The journal, book, conference, or media format that contains this work (e.g. \"Creation Research Society Quarterly\", \"DVD\"). For DVD/CD/cassette references, the Page field becomes Run Time.",
        publisher: "The original publishing organization. Must match an existing entry in the sources directory; use the autocomplete suggestions or click \"Create this publisher\" to add one.",
        source: "Where a copy of this work can be obtained today. Only set when it differs from the publisher (e.g. when the original publisher is defunct). Must match an existing entry in the sources directory.",
        page: "Page number(s) for printed works, or run time for DVD/CD/cassette references.",
        type: "Optional category for the work (e.g. technical article, media, review). Lets users on the public site filter results to only the kinds of sources they want.",
        abstract: "Short summary of the work's content. Tabs and line breaks are preserved; smart quotes and other typographic punctuation are normalised on save."
    },
    sources: {
        name: "The display name of the publisher or source. This is what references point to via their Publisher and Source fields, so changes here may affect every ref that references this source.",
        address: "Street address. Used for citation purposes and for users wanting to obtain a physical copy.",
        city: "City of the source's primary office or library.",
        state: "State, province, or region.",
        zip: "ZIP or postal code.",
        telephone: "Voice contact number, including country code if outside the US.",
        fax: "Fax number, if the source still maintains one.",
        email: "Public contact email for general inquiries.",
        website: "The source's primary website. The \"Go to source\" action on a reference opens this URL — don't include the protocol prefix; \"http://\" is added automatically."
    },
    campaigns: {
        name: "Short label for this campaign (under 150 chars). Shown in the campaigns list and in the picker when adding refs from the references page.",
        description: "What needs to be done to refs in this campaign. Be specific enough that any editor picking this up later can finish the work without asking — e.g. \"Replace en/em dashes in titles with hyphens; verify against printed copy.\""
    }
};
