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
      .replace(/[.,]/g, "") // remove EVERY (g means global) comma or doc from the string
      .replace(
        /\b(the|incorporated|corporation|company|limited|inc|corp|llc|ltd|co)\b/g,
        ""
      )
      .replace(/\s+/g, " ") // \s anywhite space + means one or more, g means replace every match
      .trim();
  
    if (!normalized) {
      throw new Error("Company name cannot be empty after normalization");
    }
  
    return normalized // example "coca-cola brothers"
      .split(" ")  // ---> ['coca-cola', 'brothers']
      .map((word) => // ---> // the following 3 lines run for each word
        word  // 1) ['coca', 'cola'] ---> ['C' + 'oca', 'C' + 'ola'] ---> "Coca-Cola"
              // 2) ['brothers'] ---> ['B' + 'rothers'] ---> 'Brothers'
          .split("-") 
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("-")
      )  // ['Coca-Cola, 'Brothers']
      .join(" "); // 'Coca-Cola Brothers'
  }