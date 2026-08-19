/**
 * The sixteen placeholder products, copied from doc-portal/src/lib/products.ts.
 *
 * They exist so that an empty registry is not the first thing anyone sees: the
 * admin UI, /api/products and the portal all have something to render before a
 * single real product is registered. src/index.ts loads them once, into an
 * empty Products collection only — see the bootstrap there for what "once"
 * means and how to switch it off.
 *
 * This is a copy, not a shared module: the portal compiles its array into its
 * own image and the two repositories are deployed separately. The copy stops
 * mattering the day the portal reads the registry over HTTP, which is the point
 * of standing this component up — at which moment this file becomes the only
 * one of the two that is still read.
 */

export interface SeedProduct {
  slug: string;
  name: string;
  summary: string;
  domain: string;
  owner: string;
  contact: string;
  lifecycle: "incubating" | "active" | "maintained" | "sunset";
  version: string;
  /** ISO date, as the schema's `registered` field expects. */
  registered: string;
  repository: string;
  tags: string[];
  metrics: {
    docsUpdatedDaysAgo: number;
    apiContracts: number;
    contractScore: "A" | "B" | "C" | "D";
    acceptancePassRate: number;
    openIncidents: number;
    roadmapItemsInFlight: number;
  };
}

export const seedProducts: SeedProduct[] = [
  {
    "slug": "client-onboarding",
    "name": "Client Onboarding",
    "summary": "Opens a relationship end to end: identification, due diligence, risk classification and the first funded account.",
    "domain": "Client lifecycle",
    "owner": "Onboarding squad",
    "contact": "onboarding@example.org",
    "lifecycle": "active",
    "version": "4.2.0",
    "registered": "2024-02-19",
    "repository": "https://github.com/example/client-onboarding",
    "tags": [
      "kyc",
      "due diligence",
      "workflow",
      "regulatory"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 2,
      "apiContracts": 9,
      "contractScore": "A",
      "acceptancePassRate": 98,
      "openIncidents": 0,
      "roadmapItemsInFlight": 4
    }
  },
  {
    "slug": "portfolio-reporting",
    "name": "Portfolio Reporting",
    "summary": "Produces the periodic and on-demand statements a client reads: positions, performance, fees and tax lots.",
    "domain": "Reporting",
    "owner": "Reporting squad",
    "contact": "reporting@example.org",
    "lifecycle": "active",
    "version": "7.1.3",
    "registered": "2023-06-01",
    "repository": "https://github.com/example/portfolio-reporting",
    "tags": [
      "statements",
      "performance",
      "pdf",
      "scheduling"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 6,
      "apiContracts": 5,
      "contractScore": "B",
      "acceptancePassRate": 91,
      "openIncidents": 1,
      "roadmapItemsInFlight": 6
    }
  },
  {
    "slug": "order-management",
    "name": "Order Management",
    "summary": "Captures, validates and routes investment orders, and keeps their state from instruction to execution.",
    "domain": "Trading",
    "owner": "Trading platform team",
    "contact": "trading@example.org",
    "lifecycle": "active",
    "version": "11.0.0",
    "registered": "2022-11-08",
    "repository": "https://github.com/example/order-management",
    "tags": [
      "orders",
      "routing",
      "fix",
      "execution"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 1,
      "apiContracts": 14,
      "contractScore": "A",
      "acceptancePassRate": 96,
      "openIncidents": 2,
      "roadmapItemsInFlight": 3
    }
  },
  {
    "slug": "payments",
    "name": "Payments",
    "summary": "Initiates, screens and settles outgoing and incoming payments, with the audit trail each one has to carry.",
    "domain": "Cash",
    "owner": "Payments squad",
    "contact": "payments@example.org",
    "lifecycle": "active",
    "version": "6.4.1",
    "registered": "2023-01-23",
    "repository": "https://github.com/example/payments",
    "tags": [
      "iso20022",
      "sanctions screening",
      "settlement",
      "sepa"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 4,
      "apiContracts": 11,
      "contractScore": "B",
      "acceptancePassRate": 89,
      "openIncidents": 3,
      "roadmapItemsInFlight": 5
    }
  },
  {
    "slug": "custody-settlement",
    "name": "Custody & Settlement",
    "summary": "Holds positions, matches and settles trades with counterparties, and reconciles what the custodian says we own.",
    "domain": "Post-trade",
    "owner": "Post-trade team",
    "contact": "post-trade@example.org",
    "lifecycle": "maintained",
    "version": "9.8.2",
    "registered": "2022-04-14",
    "repository": "https://github.com/example/custody-settlement",
    "tags": [
      "settlement",
      "reconciliation",
      "corporate actions",
      "swift"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 34,
      "apiContracts": 7,
      "contractScore": "C",
      "acceptancePassRate": 84,
      "openIncidents": 1,
      "roadmapItemsInFlight": 2
    }
  },
  {
    "slug": "market-data",
    "name": "Market Data",
    "summary": "Ingests, normalises and republishes prices, reference rates and corporate action notices to everything downstream.",
    "domain": "Data",
    "owner": "Data platform team",
    "contact": "data-platform@example.org",
    "lifecycle": "active",
    "version": "5.2.7",
    "registered": "2023-03-30",
    "repository": "https://github.com/example/market-data",
    "tags": [
      "prices",
      "streaming",
      "normalisation",
      "vendors"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 3,
      "apiContracts": 6,
      "contractScore": "A",
      "acceptancePassRate": 95,
      "openIncidents": 0,
      "roadmapItemsInFlight": 3
    }
  },
  {
    "slug": "reference-data",
    "name": "Reference Data",
    "summary": "The single source for instruments, counterparties, calendars and the codes every other product joins on.",
    "domain": "Data",
    "owner": "Data platform team",
    "contact": "data-platform@example.org",
    "lifecycle": "active",
    "version": "3.9.0",
    "registered": "2023-09-12",
    "repository": "https://github.com/example/reference-data",
    "tags": [
      "golden source",
      "instruments",
      "mastering",
      "lei"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 8,
      "apiContracts": 8,
      "contractScore": "B",
      "acceptancePassRate": 93,
      "openIncidents": 0,
      "roadmapItemsInFlight": 4
    }
  },
  {
    "slug": "risk-scoring",
    "name": "Risk Scoring",
    "summary": "Scores clients, portfolios and transactions against the risk policy, and explains every score it returns.",
    "domain": "Risk & compliance",
    "owner": "Risk engineering",
    "contact": "risk-engineering@example.org",
    "lifecycle": "active",
    "version": "2.6.4",
    "registered": "2024-05-07",
    "repository": "https://github.com/example/risk-scoring",
    "tags": [
      "scoring",
      "policy",
      "explainability",
      "regulatory"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 11,
      "apiContracts": 4,
      "contractScore": "B",
      "acceptancePassRate": 88,
      "openIncidents": 1,
      "roadmapItemsInFlight": 7
    }
  },
  {
    "slug": "billing-and-fees",
    "name": "Billing & Fees",
    "summary": "Calculates management, transaction and custody fees, applies the agreed conditions, and issues the invoice.",
    "domain": "Revenue",
    "owner": "Revenue squad",
    "contact": "revenue@example.org",
    "lifecycle": "active",
    "version": "4.0.9",
    "registered": "2023-11-02",
    "repository": "https://github.com/example/billing-and-fees",
    "tags": [
      "pricing",
      "invoicing",
      "conditions",
      "accruals"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 19,
      "apiContracts": 5,
      "contractScore": "C",
      "acceptancePassRate": 79,
      "openIncidents": 2,
      "roadmapItemsInFlight": 5
    }
  },
  {
    "slug": "client-portal",
    "name": "Client Portal",
    "summary": "What the client sees: holdings, documents, messages and the actions they can start themselves.",
    "domain": "Client experience",
    "owner": "Digital channels team",
    "contact": "digital-channels@example.org",
    "lifecycle": "active",
    "version": "8.3.0",
    "registered": "2022-08-25",
    "repository": "https://github.com/example/client-portal",
    "tags": [
      "web",
      "mobile",
      "accessibility",
      "self-service"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 5,
      "apiContracts": 10,
      "contractScore": "A",
      "acceptancePassRate": 97,
      "openIncidents": 1,
      "roadmapItemsInFlight": 8
    }
  },
  {
    "slug": "advisor-workbench",
    "name": "Advisor Workbench",
    "summary": "The relationship manager’s desk: client context, proposals, suitability checks and what to do next.",
    "domain": "Advisory",
    "owner": "Advisory squad",
    "contact": "advisory@example.org",
    "lifecycle": "active",
    "version": "3.1.2",
    "registered": "2024-01-15",
    "repository": "https://github.com/example/advisor-workbench",
    "tags": [
      "proposals",
      "suitability",
      "crm",
      "workflow"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 7,
      "apiContracts": 6,
      "contractScore": "B",
      "acceptancePassRate": 90,
      "openIncidents": 0,
      "roadmapItemsInFlight": 6
    }
  },
  {
    "slug": "document-vault",
    "name": "Document Vault",
    "summary": "Stores, classifies and retains every client document, and answers who may read which one.",
    "domain": "Content",
    "owner": "Content services team",
    "contact": "content-services@example.org",
    "lifecycle": "maintained",
    "version": "2.4.6",
    "registered": "2022-10-03",
    "repository": "https://github.com/example/document-vault",
    "tags": [
      "storage",
      "retention",
      "classification",
      "entitlements"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 61,
      "apiContracts": 3,
      "contractScore": "C",
      "acceptancePassRate": 82,
      "openIncidents": 0,
      "roadmapItemsInFlight": 1
    }
  },
  {
    "slug": "notification-hub",
    "name": "Notification Hub",
    "summary": "Delivers what the platform has to tell a person — mail, push, in-app — once, in their channel and language.",
    "domain": "Platform",
    "owner": "Platform services team",
    "contact": "platform-services@example.org",
    "lifecycle": "active",
    "version": "1.9.1",
    "registered": "2024-07-22",
    "repository": "https://github.com/example/notification-hub",
    "tags": [
      "templates",
      "channels",
      "preferences",
      "i18n"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 13,
      "apiContracts": 4,
      "contractScore": "B",
      "acceptancePassRate": 92,
      "openIncidents": 0,
      "roadmapItemsInFlight": 3
    }
  },
  {
    "slug": "audit-trail",
    "name": "Audit Trail",
    "summary": "Records who did what, to which record, when — and makes the answer producible on request, years later.",
    "domain": "Risk & compliance",
    "owner": "Platform services team",
    "contact": "platform-services@example.org",
    "lifecycle": "maintained",
    "version": "2.0.4",
    "registered": "2023-04-18",
    "repository": "https://github.com/example/audit-trail",
    "tags": [
      "immutability",
      "retention",
      "evidence",
      "regulatory"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 47,
      "apiContracts": 2,
      "contractScore": "B",
      "acceptancePassRate": 86,
      "openIncidents": 0,
      "roadmapItemsInFlight": 1
    }
  },
  {
    "slug": "esg-insights",
    "name": "ESG Insights",
    "summary": "Scores portfolios against sustainability criteria and explains the exposure behind each score.",
    "domain": "Investment",
    "owner": "Sustainable investing squad",
    "contact": "sustainable-investing@example.org",
    "lifecycle": "incubating",
    "version": "0.4.0",
    "registered": "2025-03-05",
    "repository": "https://github.com/example/esg-insights",
    "tags": [
      "sustainability",
      "scoring",
      "disclosure",
      "analytics"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 9,
      "apiContracts": 2,
      "contractScore": "C",
      "acceptancePassRate": 74,
      "openIncidents": 1,
      "roadmapItemsInFlight": 9
    }
  },
  {
    "slug": "legacy-statements",
    "name": "Legacy Statements",
    "summary": "The statement generator being replaced by Portfolio Reporting. Documented because it is still producing documents.",
    "domain": "Reporting",
    "owner": "Reporting squad",
    "contact": "reporting@example.org",
    "lifecycle": "sunset",
    "version": "12.6.11",
    "registered": "2021-05-11",
    "repository": "https://github.com/example/legacy-statements",
    "tags": [
      "decommissioning",
      "statements",
      "batch"
    ],
    "metrics": {
      "docsUpdatedDaysAgo": 128,
      "apiContracts": 1,
      "contractScore": "D",
      "acceptancePassRate": 68,
      "openIncidents": 4,
      "roadmapItemsInFlight": 0
    }
  }
];
