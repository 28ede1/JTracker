# Problem Statement:

Early-career students pursuing careers in tech struggle to navigate the process of finding opportunities to develop themselves, as well as the recruiting process, because they lack experience and must manage applications, networking, company research, and preparation across disconnected sources and tools.

# Solution:

It is an AI-powered platform for discovering career opportunities, including internships, full-time positions, company webinars, hackathons, and networking events. The platform uses AI to assess how well job descriptions align with a user’s resume, helps users manage professional contacts at target companies, tracks applications with alerts and follow-ups, and provides AI-assisted company research and interview preparation.

# Core Features

1) Opportunity Discovery (Jobs, Internships, Virtual Events, In-Person Events & Hackathons)
2) Resume & Job Fit Analysis 
3) Application Status Tracking
4) Contact / Networking Management
5) Application Email Alerts & Follow-ups
6) Automated Company Research

# Data Models:

## User

| Field | Type |
| --- | --- |
| id | String @id @db.Uuid |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |
| username | String @unique |
| resumes | Resume[] |
| contacts | Contact[] |
| applications | Application[] |
| alerts | Alert[] |
| fitAnalyses | FitAnalysis[] |

## Opportunity (Internship, Job, Hackathon, Company Event)

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |
| type | OpportunityType |
| title | String |
| description | String? @db.Text |
| sourceUrl | String |
| location | String? |
| workMode | WorkMode? |
| postedAt | DateTime? |
| deadlineAt | DateTime? |
| details | Json? |
| isActive | Boolean @default(true) |
| companyId | String? @db.Uuid |
| company | Company? @relation(fields: [companyId], references: [id]) |
| applications | Application[] |
| fitAnalyses | FitAnalysis[] |
| researchReports | ResearchReport[] |

## Resume

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |
| userId | String @db.Uuid |
| user | User @relation(fields: [userId], references: [id], onDelete: Cascade) |
| label | String |
| filePath | String |
| fileType | FileType |
| fileSize | Int |
| parsedText | String? @db.Text |
| parseStatus | ParseStatus @default(PENDING) |
| applications | Application[] |
| fitAnalyses | FitAnalysis[] |

## Fit Analysis

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| userId | String @db.Uuid |
| user | User @relation(fields: [userId], references: [id], onDelete: Cascade) |
| resumeId | String @db.Uuid |
| resume | Resume @relation(fields: [resumeId], references: [id], onDelete: Cascade) |
| opportunityId | String @db.Uuid |
| opportunity | Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade) |
| status | GenerationStatus @default(PENDING) |
| score | Int? |
| summary | String? @db.Text |
| strengths | String[] |
| gaps | String[] |
| model | String? |
| generatedAt | DateTime? |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |

## Company

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| name | String |
| domain | String? @unique |
| websiteUrl | String? |
| logoUrl | String? |
| industry | String? |
| hqLocation | String? |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |
| opportunities | Opportunity[] |
| contacts | Contact[] |
| researchReports | ResearchReport[] |

## Contact

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| userId | String @db.Uuid |
| user | User @relation(fields: [userId], references: [id], onDelete: Cascade) |
| companyId | String? @db.Uuid |
| company | Company? @relation(fields: [companyId], references: [id]) |
| firstName | String |
| lastName | String? |
| title | String? |
| email | String? |
| phone | String? |
| linkedinUrl | String? |
| relationship | ContactRelationship |
| notes | String? @db.Text |
| lastContactedAt | DateTime? |
| nextFollowUpAt | DateTime? |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |
| referredApplications | Application[] |
| alerts | Alert[] |

## Application

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| userId | String @db.Uuid |
| user | User @relation(fields: [userId], references: [id], onDelete: Cascade) |
| opportunityId | String @db.Uuid |
| opportunity | Opportunity @relation(fields: [opportunityId], references: [id]) |
| resumeId | String? @db.Uuid |
| resume | Resume? @relation(fields: [resumeId], references: [id], onDelete: SetNull) |
| referralContactId | String? @db.Uuid |
| referralContact | Contact? @relation(fields: [referralContactId], references: [id], onDelete: SetNull) |
| status | ApplicationStatus @default(SAVED) |
| appliedAt | DateTime? |
| statusChangedAt | DateTime @default(now()) |
| notes | String? @db.Text |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |
| alerts | Alert[] |

## Alert

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| userId | String @db.Uuid |
| user | User @relation(fields: [userId], references: [id], onDelete: Cascade) |
| applicationId | String? @db.Uuid |
| application | Application? @relation(fields: [applicationId], references: [id], onDelete: Cascade) |
| contactId | String? @db.Uuid |
| contact | Contact? @relation(fields: [contactId], references: [id], onDelete: Cascade) |
| type | AlertType |
| title | String |
| body | String? @db.Text |
| scheduledFor | DateTime |
| status | AlertStatus @default(PENDING) |
| sentAt | DateTime? |
| dedupeKey | String @unique |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |

## Research Report

| Field | Type |
| --- | --- |
| id | String @id @default(uuid()) @db.Uuid |
| companyId | String @db.Uuid |
| company | Company @relation(fields: [companyId], references: [id], onDelete: Cascade) |
| opportunityId | String? @db.Uuid |
| opportunity | Opportunity? @relation(fields: [opportunityId], references: [id], onDelete: Cascade) |
| reportType | ReportType |
| status | GenerationStatus @default(PENDING) |
| contentMd | String? @db.Text |
| sources | Json? |
| model | String? |
| generatedAt | DateTime? |
| expiresAt | DateTime? |
| createdAt | DateTime @default(now()) |
| updatedAt | DateTime @updatedAt |


# Endpoints:

# Component Hierarchy:

# AI Feature Spec

