"use client";

import { useState } from "react";
import { FieldMessage } from "@/frontend/design-system";

const leadSources = [
  "website",
  "referral",
  "outbound",
  "event",
  "partner",
  "social_media",
  "import",
  "manual",
  "other",
] as const;

const socialPlatforms = [
  "tiktok",
  "instagram",
  "facebook",
  "linkedin",
  "x",
  "youtube",
] as const;

type LeadSource = (typeof leadSources)[number];
type SocialPlatform = (typeof socialPlatforms)[number];

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());

export function LeadSourceFields({
  initialSource,
  initialPlatform,
  sourceError,
  platformError,
}: {
  initialSource: LeadSource;
  initialPlatform?: SocialPlatform | null;
  sourceError?: string;
  platformError?: string;
}) {
  const [source, setSource] = useState<LeadSource>(initialSource);
  const [platform, setPlatform] = useState(
    initialSource === "social_media" ? (initialPlatform ?? "") : "",
  );

  return (
    <>
      <label className="field" htmlFor="source">
        <span>
          Source<strong className="required-marker"> required</strong>
        </span>
        <select
          id="source"
          name="source"
          required
          aria-required="true"
          aria-invalid={Boolean(sourceError)}
          aria-describedby={sourceError ? "source-error" : undefined}
          value={source}
          onChange={(event) => {
            const next = event.currentTarget.value as LeadSource;
            setSource(next);
            if (next !== "social_media") setPlatform("");
          }}
        >
          {leadSources.map((value) => (
            <option value={value} key={value}>
              {label(value)}
            </option>
          ))}
        </select>
        {sourceError && (
          <FieldMessage id="source-error" tone="error">
            {sourceError}
          </FieldMessage>
        )}
      </label>
      {source === "social_media" && (
        <label className="field" htmlFor="sourcePlatform">
          <span>
            Platform<strong className="required-marker"> required</strong>
          </span>
          <select
            id="sourcePlatform"
            name="sourcePlatform"
            required
            aria-required="true"
            aria-invalid={Boolean(platformError)}
            aria-describedby={
              platformError
                ? "sourcePlatform-help sourcePlatform-error"
                : "sourcePlatform-help"
            }
            value={platform}
            onChange={(event) => setPlatform(event.currentTarget.value)}
          >
            <option value="">Choose Platform</option>
            {socialPlatforms.map((value) => (
              <option value={value} key={value}>
                {label(value)}
              </option>
            ))}
          </select>
          <FieldMessage id="sourcePlatform-help">
            Required only when Source is Social media. No Platform is inferred.
          </FieldMessage>
          {platformError && (
            <FieldMessage id="sourcePlatform-error" tone="error">
              {platformError}
            </FieldMessage>
          )}
        </label>
      )}
    </>
  );
}
