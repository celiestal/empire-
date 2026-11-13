// The done-for-you short video service: the owner edits videos for local businesses
// with the Empire auto editor. Four Growth clients is about $1,000 a month.

export interface ServicePackage {
  id: string;
  name: string;
  monthlyUsd: number;
  videos: number;
  includes: string[];
}

export const SERVICE_PACKAGES: ServicePackage[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyUsd: 150,
    videos: 4,
    includes: ["4 edited vertical videos a month", "Captions, zooms, sound and a hook on screen", "Caption and hashtags for each video"],
  },
  {
    id: "growth",
    name: "Growth",
    monthlyUsd: 250,
    videos: 8,
    includes: ["8 edited vertical videos a month", "Everything in Starter", "Monthly content plan with 8 video ideas and scripts"],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyUsd: 450,
    videos: 12,
    includes: ["12 edited vertical videos a month", "Everything in Growth", "Posting to Instagram, Facebook and YouTube for you"],
  },
];

/** How many clients of a package it takes to reach a monthly goal. */
export function clientsFor(goalUsd: number, pkg: ServicePackage): number {
  return Math.ceil(goalUsd / pkg.monthlyUsd);
}
