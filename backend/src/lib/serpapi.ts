// ---------------------------------------------------------------------------
// SerpAPI Client (server side)
//
// Service for scraping and parsing search engine results. The specific endpoint
// used for sourcing internship/job opportunities is the Google Job Search endpoint
// which returns raw listings that must be normalized and processed.

// This client will return raw respones for a given number of pages of results
// defined by maximumPages.
// ---------------------------------------------------------------------------

import "dotenv/config";

// serpApiClient.ts

const SEARCH_QUERY =
  '("software engineering intern" OR "software developer intern" OR ' +
  '"data science intern" OR "data analyst intern" OR ' +
  '"machine learning intern" OR "cybersecurity intern" OR ' +
  '"product management intern" OR "UX design intern" OR "IT intern") 2027';

// based on api documentation, it describes what a job entry may look lik
export type SerpApiJob = {
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  thumbnail?: string;

  detected_extensions?: {
    posted_at?: string;
    schedule_type?: string;
    salary?: string;
  };

  description?: string;

  job_highlights?: Array<{
    title?: string;
    items?: string[];
  }>;

apply_options?: Array<{
    title: string;
    link: string;
  }>;
  job_id?: string;
};

type SerpApiResponse = {
  jobs_results?: SerpApiJob[];

  serpapi_pagination?: {
    next_page_token?: string;
  };

  error?: string;
};

export async function fetchSerpApiJobs(): Promise<SerpApiJob[]> {
  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is missing");
  }

  const allJobs: SerpApiJob[] = [];
  let nextPageToken: string | undefined;

  const maximumPages = 5;

  for ( let pageNumber = 1; pageNumber <= maximumPages; pageNumber++ ) {
    const params = new URLSearchParams({
      engine: "google_jobs",
      q: SEARCH_QUERY,
      api_key: apiKey,
      hl: "en",
      gl: "us",
    });

    if (nextPageToken) {
      params.set("next_page_token", nextPageToken);
    }

    const response = await fetch(
      `https://serpapi.com/search.json?${params}`
    );

    if (!response.ok) {
      throw new Error(
        `SerpApi request failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as SerpApiResponse;

    if (data.error) {
      throw new Error(`SerpApi error: ${data.error}`);
    }

    allJobs.push(...(data.jobs_results ?? []));

    nextPageToken =
      data.serpapi_pagination?.next_page_token;

    // There are no more pages.
    if (!nextPageToken) {
      break;
    }
  }

  return allJobs;
}