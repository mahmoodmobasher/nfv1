import{readFileSync,readdirSync,statSync}from"node:fs";
import{join}from"node:path";
import{describe,expect,it}from"vitest";
import{sourceCategories,socialPlatforms}from"@/frontend/features/leads/contracts/lead-intake.contracts";
import{decisionFromCandidate}from"@/frontend/features/identity-review/contracts/identity-review.contracts";
import{reviewDetailFixture}from"@/frontend/features/identity-review/testing/identity-review.fixtures";
function files(root:string):string[]{return readdirSync(root).flatMap(name=>{const path=join(root,name);return statSync(path).isDirectory()?files(path):[path]})}
describe("P1A frontend authority and view-model boundaries",()=>{
 it("exposes public entries and keeps clients out of server internals",()=>{for(const feature of["leads","identity-review"]){expect(statSync(`src/frontend/features/${feature}/README.md`).isFile()).toBe(true);expect(statSync(`src/frontend/features/${feature}/index.ts`).isFile()).toBe(true)}for(const path of files("src/frontend").filter(path=>/\.tsx?$/.test(path))){const source=readFileSync(path,"utf8");if(/^\s*["']use client["']/m.test(source))expect(source,path).not.toMatch(/@\/(?:backend|server)\//)}});
 it("keeps routes thin and on feature public APIs",()=>{for(const path of["src/app/crm/leads/new/page.tsx","src/app/crm/identity-reviews/page.tsx","src/app/crm/identity-reviews/[leadId]/page.tsx"]){const source=readFileSync(path,"utf8");expect(source,path).toContain("@/frontend/features/");expect(source,path).not.toMatch(/frontend\/features\/.+\/(?:components|contracts|server)\//)}});
 it("locks source and social registries",()=>{expect(sourceCategories.map(([id])=>id)).toEqual(["website","referral","outbound","event","partner","social_media","import","manual","other"]);expect(socialPlatforms.map(([id])=>id)).toEqual(["tiktok","instagram","facebook","linkedin","x","youtube","other_social"])});
 it("uses masked candidates and versioned link decisions",()=>{const candidate=reviewDetailFixture.candidates[0];expect(candidate.maskedEmail).toContain("***");expect(candidate).not.toHaveProperty("email");expect(decisionFromCandidate(candidate)).toEqual({action:"link",candidateId:candidate.candidateId,targetId:candidate.targetId,expectedTargetVersion:1})});
});
