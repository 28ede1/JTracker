// ---------------------------------------------------------------------------
// Company utilities
//
// Used for the normalization process of SerpAPI job data
// ---------------------------------------------------------------------------

// Takes the names of companies from the raw data retrieved by serp api
// and normalizes the company names to aid in making company names a unique
// key used for deduping
export function normalizeCompanyName(name: string): string {
    const normalized = name
      .toLowerCase()
      .replace(/[.,]/g, "") // remove every common or doc from the string
      .replace(
        /\b(the|incorporated|corporation|company|limited|inc|corp|llc|ltd|co)\b/g,
        ""
      )
      .replace(/\s+/g, " ") // \s anywhite space + means one or more, g means replace every match
      .trim();
  
    if (!normalized) {
      throw new Error("Company name cannot be empty after normalization");
    }
  
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}