# Problem Statement:

Early-career students pursuing careers in tech struggle to navigate the process of finding opportunities to develop themselves, as well as the recruiting process, because they lack experience and must manage applications, networking, company research, and preparation across disconnected sources and tools.

# Solution:

It is an AI-powered platform for discovering career opportunities, including internships, full-time positions, company webinars, hackathons, and networking events. The platform uses AI to assess how well job descriptions align with a user’s resume, helps users manage professional contacts at target companies, tracks applications with alerts and follow-ups, and provides AI-assisted company research and interview preparation.

# Tech Stack

PostgreSQL (Relational DB)
Express (Routing, Middleware (auth checks, logging, parsing JSON bodies, error handling), Request/Response helpers)
Node (Runs JavaScript/TypeScript outside of the browser)
React (Frontend)
Supabase (Hosts PostgreSQL DB, handles Authentication)
Prisma (DB access, schema migrations)
TypeScript (Catches type errors)
Zod (TypeScript library for validating input)
Vitest (Organizes and runs tests, provides assertions)
Supertest (Tests routes)

# Data Models

Company
Opportunity
Contact
User
Resume
Contact
Application
FitAnalysis
ResearchReport
Alert

# Core Features

1) Opportunity Discovery (Jobs, Internships, Virtual Events, In-Person Events & Hackathons, Fellowships, Research)
2) Resume & Job Fit Analysis 
3) Application Status Tracking
4) Contact / Networking Management
5) Application Email Alerts & Follow-ups
6) Automated Company Research

## Feature Implementation Specs

1) Opportunity Discovery

Sep 19 – The current implementation idea involves using SerpAPI to get opportunity listings (just SWE internships for now) from Google search results. This way, I don’t have to worry about using multiple APIs to fetch job data, especially since some of the more useful APIs, like Greenhouse and Ashby, do not support global job searches. Instead, they require you to query each company individually, assuming the company even lists jobs on that platform. 

The current implementation is as follows:
- Run a scheduled injestion job once per day 
- Use SerpAPI's Google Jobs API to search for recent swe internships for the target recruiting year
- Retrieve and process 5-10 pages of results per ingestion run
- Normalize each SerpAPI result into JTracker's Opportunity data model
- Before a search result is used to create an Opportunity entry, check if it exists in the db. Either use the job_id parameter that SerpAPI includes if available as a dedup key, or create a dedup key using URL, or use key using company name, title, location that is hashed.
- Figure out someway to determine when old postings should be removed from db