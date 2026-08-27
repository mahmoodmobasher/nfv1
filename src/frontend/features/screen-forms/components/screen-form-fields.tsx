import { FieldMessage } from "@/frontend/design-system";

export type ScreenKind = "company" | "contact" | "lead";
export type ScreenFormErrors = Record<string, string>;

export function fieldId(path: string) {
  const last = path.split(".").at(-1) ?? path;
  return (
    (
      {
        name: "companyName",
        snapshotName: "companyId",
        amountMinor: "annualRevenue",
        currencyCode: "annualRevenue",
        currencyExponent: "annualRevenue",
        visibleTeamVersions: "visibleTeamIds",
        companyVersion: "companyId",
        parentCompanyVersion: "parentCompanyId",
        stageUpdatedAt: "stageId",
        company: "companyId",
        sourcePlatform: "sourcePlatform",
      } as Record<string, string>
    )[last] ?? last
  );
}

export function validationIssues(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): ScreenFormErrors {
  const result: ScreenFormErrors = {};
  for (const issue of error.issues) {
    const id = fieldId(issue.path.map(String).join("."));
    result[id] ??= issue.message.replaceAll("_", " ");
  }
  return result;
}

export function ErrorSummary({
  errors,
  summary,
  linkedFields,
}: {
  errors: ScreenFormErrors;
  summary: React.RefObject<HTMLDivElement | null>;
  linkedFields: ReadonlySet<string>;
}) {
  if (!Object.keys(errors).length) return null;
  return (
    <div
      ref={summary}
      className="alert error error-summary"
      role="alert"
      tabIndex={-1}
    >
      <b>Please correct the following:</b>
      <ul>
        {Object.entries(errors).map(([id, message]) =>
          linkedFields.has(id) ? (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={() =>
                  setTimeout(() => {
                    const target = document.getElementById(id);
                    const disclosure = target?.closest("details");
                    if (disclosure) disclosure.open = true;
                    target?.focus();
                  })
                }
              >
                {message}
              </a>
            </li>
          ) : (
            <li key={id}>{message}</li>
          ),
        )}
      </ul>
    </div>
  );
}

export function SectionHeading({
  id,
  title,
  help,
}: {
  id: string;
  title: string;
  help: string;
}) {
  return (
    <header className="screen-section-heading">
      <span className="screen-section-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5" />
        </svg>
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{help}</p>
      </div>
    </header>
  );
}

export function OptionalSection({
  enabled,
  open,
  summary,
  children,
}: {
  enabled: boolean;
  open: boolean;
  summary: string;
  children: React.ReactNode;
}) {
  return enabled ? (
    <details className="screen-disclosure" open={open}>
      <summary>{summary}</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}

const commonLinkedFields = [
  "annualRevenue",
  "street",
  "city",
  "stateProvince",
  "postalCode",
  "country",
  "responsibleMembershipId",
  "responsibleTeamId",
  "visibility",
  "visibleTeamIds",
];

export function linkedFields(kind: ScreenKind) {
  const owned =
    kind === "company"
      ? [
          "companyName",
          "domain",
          "website",
          "industry",
          "sizeBand",
          "employeeCount",
          "parentCompanyId",
          "phone",
        ]
      : kind === "contact"
        ? [
            "salutation",
            "firstName",
            "lastName",
            "jobTitle",
            "department",
            "primaryEmail",
            "secondaryEmail",
            "directPhone",
            "mobilePhone",
            "linkedinUrl",
            "lifecycleStage",
            "companyId",
            "companyRole",
          ]
        : [
            "salutation",
            "firstName",
            "lastName",
            "companyId",
            "jobTitle",
            "primaryEmail",
            "secondaryEmail",
            "officePhone",
            "mobilePhone",
            "fax",
            "website",
            "twitterHandle",
            "promotionalEmailOptOut",
            "source",
            "sourcePlatform",
            "stageId",
            "rating",
            "industry",
            "employeeCount",
          ];
  return new Set([...commonLinkedFields, ...owned]);
}

export function Input({
  id,
  label,
  required,
  help,
  ...props
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  "data-error"?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = props["data-error"] as string | undefined;
  const described =
    [help ? `${id}-help` : "", error ? `${id}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? (
          <strong className="required-marker"> required</strong>
        ) : (
          <small> optional</small>
        )}
      </span>
      <input
        {...props}
        data-error={undefined}
        id={id}
        name={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={described}
      />
      {help && <FieldMessage id={`${id}-help`}>{help}</FieldMessage>}
      {error && (
        <FieldMessage id={`${id}-error`} tone="error">
          {error}
        </FieldMessage>
      )}
    </label>
  );
}

export function Select({
  id,
  label,
  children,
  required,
  error,
  defaultValue,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
  defaultValue?: string;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? (
          <strong className="required-marker"> required</strong>
        ) : (
          <small> optional</small>
        )}
      </span>
      <select
        id={id}
        name={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        defaultValue={defaultValue}
      >
        {children}
      </select>
      {error && (
        <FieldMessage id={`${id}-error`} tone="error">
          {error}
        </FieldMessage>
      )}
    </label>
  );
}

export function AddressFields({
  errors,
  defaults = {},
  collapsible = false,
}: {
  errors: ScreenFormErrors;
  defaults?: Record<string, string | null>;
  collapsible?: boolean;
}) {
  return (
    <section aria-labelledby="address-heading">
      <SectionHeading
        id="address-heading"
        title="Address Information"
        help="Add the current business mailing address."
      />
      <OptionalSection
        enabled={collapsible}
        open={Boolean(
          errors.street ||
            errors.city ||
            errors.stateProvince ||
            errors.postalCode ||
            errors.country,
        )}
        summary="Address fields — optional"
      >
        <div className="form-grid">
          <Input
            id="street"
            label="Street"
            autoComplete="street-address"
            defaultValue={defaults.street ?? ""}
            data-error={errors.street}
          />
          <Input
            id="city"
            label="City"
            autoComplete="address-level2"
            defaultValue={defaults.city ?? ""}
            data-error={errors.city}
          />
          <Input
            id="stateProvince"
            label="State/Province"
            autoComplete="address-level1"
            defaultValue={defaults.stateProvince ?? ""}
            data-error={errors.stateProvince}
          />
          <Input
            id="postalCode"
            label="Postal code"
            autoComplete="postal-code"
            defaultValue={defaults.postalCode ?? ""}
            data-error={errors.postalCode}
          />
          <Input
            id="country"
            label="Country"
            autoComplete="country"
            maxLength={2}
            defaultValue={defaults.country ?? ""}
            help="Use a two-letter country code, for example CA."
            data-error={errors.country}
          />
        </div>
      </OptionalSection>
    </section>
  );
}
