import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { StatusDot, type StatusDotVariant } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Check,
  CircleGauge,
  Database,
  FileCheck2,
  GitFork,
  KeyRound,
  LockKeyhole,
  PackageCheck,
  ScanSearch,
  ServerOff,
  ShieldCheck,
  Stethoscope,
  TerminalSquare,
  TriangleAlert,
} from "lucide-react";

import type {
  StudioCapability,
  StudioFinding,
  StudioSnapshot,
} from "../src/commands/studio/types.js";
import type { UpgradeAction } from "../src/commands/upgrade/types.js";

type SnapshotState =
  | { status: "loading" }
  | { status: "loaded"; snapshot: StudioSnapshot }
  | { status: "error"; message: string };

type StatusTone = {
  badge: BadgeVariant;
  dot: StatusDotVariant;
};

const navigation = [
  { href: "#overview", label: "Overview", icon: CircleGauge },
  { href: "#doctor", label: "Doctor", icon: Stethoscope },
  { href: "#upgrades", label: "Upgrades", icon: ArrowUpRight },
  { href: "#boundary", label: "Boundary", icon: LockKeyhole },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSnapshot(value: unknown): StudioSnapshot {
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.generatedAt !== "string"
    || !isRecord(value.project)
    || typeof value.project.name !== "string"
    || typeof value.project.rootDir !== "string"
    || !isRecord(value.scan)
    || value.scan.mode !== "offline"
    || !isRecord(value.posture)
    || !Array.isArray(value.capabilities)
    || !isRecord(value.drift)
    || !isRecord(value.productionReadiness)
    || !isRecord(value.upgrade)
    || !Array.isArray(value.upgrade.actions)
    || !isRecord(value.nextAction)
    || !Array.isArray(value.findings)
  ) {
    throw new Error("Studio received an incompatible snapshot.");
  }
  return value as StudioSnapshot;
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusTone(status: string): StatusTone {
  if (["clear", "current", "pass"].includes(status)) {
    return { badge: "success", dot: "success" };
  }
  if (["review", "upgrade-available", "warn", "required"].includes(status)) {
    return { badge: "warning", dot: "warning" };
  }
  if (
    ["action-required", "detected", "blocked", "fail"].includes(status)
  ) {
    return { badge: "error", dot: "error" };
  }
  return { badge: "neutral", dot: "neutral" };
}

function StatusLabel({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const tone = statusTone(status);
  return (
    <HStack gap={1.5} align="center" className="status-label">
      <StatusDot variant={tone.dot} label={label ?? titleCase(status)} />
      <Text type="supporting" weight="semibold">
        {label ?? titleCase(status)}
      </Text>
    </HStack>
  );
}

function Eyebrow({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <HStack gap={1.5} align="center" className="eyebrow">
      {icon}
      <Text type="label">{children}</Text>
    </HStack>
  );
}

function Command({
  command,
  title,
}: {
  command: string | undefined;
  title?: string | undefined;
}) {
  if (!command) return null;
  return (
    <CodeBlock
      className="studio-command"
      code={command}
      language="shell"
      {...(title ? { title } : {})}
      hasLanguageLabel={false}
      hasCopyButton
      isWrapped
      size="sm"
      width="100%"
    />
  );
}

function StatusCard({
  label,
  status,
  value,
  detail,
  href,
}: {
  label: string;
  status: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <a
      className="metric-link"
      href={href}
      aria-label={`${label}: ${value}. Review details`}
    >
      <Card
        className={`metric-card metric-${statusTone(status).dot}`}
        padding={5}
        minHeight={205}
        elevation="low"
      >
        <VStack gap={5} height="100%" justify="between">
          <HStack gap={2} justify="between" align="start">
            <Text type="supporting" weight="semibold">
              {label}
            </Text>
            <StatusLabel status={status} />
          </HStack>
          <VStack gap={1.5}>
            <Text type="large" weight="semibold" as="p" className="metric-value">
              {value}
            </Text>
            <Text type="supporting" color="secondary" as="p">
              {detail}
            </Text>
            <HStack gap={1} align="center" className="metric-action" aria-hidden>
              <Text type="supporting">Review details</Text>
              <ArrowUpRight size={13} />
            </HStack>
          </VStack>
        </VStack>
      </Card>
    </a>
  );
}

function capabilityIcon(capability: StudioCapability): ReactNode {
  const props = { size: 17, strokeWidth: 1.8, "aria-hidden": true } as const;
  if (capability.id === "prisma") return <Database {...props} />;
  if (capability.id.startsWith("oauth-github")) return <GitFork {...props} />;
  if (capability.id.startsWith("oauth-")) return <KeyRound {...props} />;
  if (capability.id === "sessions") return <ShieldCheck {...props} />;
  if (capability.id === "pm2") return <Boxes {...props} />;
  return <FileCheck2 {...props} />;
}

function CapabilityCard({ capability }: { capability: StudioCapability }) {
  return (
    <Card className="capability-card" padding={4} variant="muted">
      <HStack gap={3} align="start">
        <span className="feature-icon">{capabilityIcon(capability)}</span>
        <VStack gap={1}>
          <Heading level={3}>{capability.label}</Heading>
          <Text type="supporting" color="secondary" as="p">
            {capability.detail}
          </Text>
        </VStack>
      </HStack>
    </Card>
  );
}

function SummaryBadges({
  summary,
}: {
  summary: StudioSnapshot["scan"]["summary"];
}) {
  const badges: Array<[string, number, BadgeVariant]> = [
    ["failed", summary.failed, summary.failed > 0 ? "error" : "neutral"],
    [
      "warnings",
      summary.warnings,
      summary.warnings > 0 ? "warning" : "neutral",
    ],
    ["skipped", summary.skipped, "neutral"],
    ["passed", summary.passed, "success"],
  ];
  return (
    <HStack gap={1.5} wrap="wrap" className="summary-badges">
      {badges.map(([label, count, variant]) => (
        <Badge key={label} variant={variant} label={`${count} ${label}`} />
      ))}
    </HStack>
  );
}

function FindingCard({ finding }: { finding: StudioFinding }) {
  const tone = statusTone(finding.status);
  return (
    <Card
      className={`finding-card finding-${tone.dot}`}
      padding={5}
      variant={finding.status === "fail" ? "red" : "yellow"}
    >
      <VStack gap={4}>
        <HStack gap={3} justify="between" align="start" wrap="wrap">
          <HStack gap={2} align="center">
            <Text type="code" className="finding-id">
              {finding.id}
            </Text>
            <Heading level={3}>{finding.label}</Heading>
          </HStack>
          <Badge
            variant={tone.badge}
            label={titleCase(finding.status)}
            icon={
              finding.status === "fail" ? (
                <TriangleAlert size={13} aria-hidden />
              ) : undefined
            }
          />
        </HStack>
        <Text color="secondary" as="p">
          {finding.message}
        </Text>
        {(finding.impact || finding.remediation) && (
          <dl className="finding-details">
            {finding.impact && (
              <>
                <dt>Impact</dt>
                <dd>{finding.impact}</dd>
              </>
            )}
            {finding.remediation && (
              <>
                <dt>Remediation</dt>
                <dd>{finding.remediation}</dd>
              </>
            )}
          </dl>
        )}
        <Command command={finding.verification} title="Verify" />
      </VStack>
    </Card>
  );
}

function Findings({ snapshot }: { snapshot: StudioSnapshot }) {
  return (
    <section id="doctor" className="content-section" aria-labelledby="doctor-title">
      <div className="section-heading">
        <VStack gap={1.5}>
          <Eyebrow icon={<Stethoscope size={14} aria-hidden />}>
            Offline Doctor report
          </Eyebrow>
          <Heading level={2} id="doctor-title">
            Findings requiring attention
          </Heading>
          <Text type="supporting" color="secondary" as="p">
            {snapshot.scan.boundary}
          </Text>
        </VStack>
        <SummaryBadges summary={snapshot.scan.summary} />
      </div>
      <VStack gap={3}>
        {snapshot.findings.length > 0 ? (
          snapshot.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))
        ) : (
          <Card className="empty-card" padding={6} variant="muted">
            <EmptyState
              icon={<Check size={22} />}
              title="No offline findings require attention"
              description="Run the explicit production scan before treating the project as deployment-ready."
              headingLevel={3}
            />
          </Card>
        )}
      </VStack>
    </section>
  );
}

function UpgradeCard({
  action,
  index,
}: {
  action: UpgradeAction;
  index: number;
}) {
  const tone = statusTone(action.kind);
  return (
    <Card className={`upgrade-card upgrade-${tone.dot}`} padding={5}>
      <HStack gap={4} align="start">
        <span className="action-number">{String(index + 1).padStart(2, "0")}</span>
        <VStack gap={3} width="100%">
          <HStack gap={3} justify="between" align="start" wrap="wrap">
            <Heading level={3}>{action.title}</Heading>
            <Badge variant={tone.badge} label={titleCase(action.kind)} />
          </HStack>
          <Text color="secondary" as="p">
            {action.detail}
          </Text>
          <Command command={action.command} />
        </VStack>
      </HStack>
    </Card>
  );
}

function Upgrades({ snapshot }: { snapshot: StudioSnapshot }) {
  return (
    <section
      id="upgrades"
      className="content-section"
      aria-labelledby="upgrades-title"
    >
      <div className="section-heading">
        <VStack gap={1.5}>
          <Eyebrow icon={<PackageCheck size={14} aria-hidden />}>
            Read-only assessment
          </Eyebrow>
          <Heading level={2} id="upgrades-title">
            Outstanding upgrades
          </Heading>
        </VStack>
        <Text type="code" color="secondary">
          Core {snapshot.upgrade.engine.current} → {snapshot.upgrade.engine.target}
        </Text>
      </div>
      <VStack gap={3}>
        {snapshot.upgrade.actions.length > 0 ? (
          snapshot.upgrade.actions.map((action, index) => (
            <UpgradeCard key={`${action.kind}-${action.title}`} action={action} index={index} />
          ))
        ) : (
          <Card className="empty-card" padding={6} variant="muted">
            <EmptyState
              icon={<PackageCheck size={22} />}
              title="Project versions are current"
              description="No upgrade actions are required by this CLI release."
              headingLevel={3}
            />
          </Card>
        )}
      </VStack>
    </section>
  );
}

function Boundary({ productionCommand }: { productionCommand: string }) {
  const boundaries = [
    {
      icon: <ScanSearch size={18} aria-hidden />,
      title: "Read locally",
      detail:
        "Safe project metadata, generated structure, package declarations, and an in-memory offline Doctor report.",
    },
    {
      icon: <ServerOff size={18} aria-hidden />,
      title: "Never collected",
      detail:
        "Passwords, tokens, signing keys, database contents, Redis data, OAuth secrets, and analytics.",
    },
    {
      icon: <TriangleAlert size={18} aria-hidden />,
      title: "Failure behavior",
      detail:
        "Unknown state is shown as not assessed. Missing evidence is never presented as healthy.",
    },
  ];
  return (
    <section
      id="boundary"
      className="content-section boundary-section"
      aria-labelledby="boundary-title"
    >
      <VStack gap={1.5}>
        <Eyebrow icon={<LockKeyhole size={14} aria-hidden />}>
          Security boundary
        </Eyebrow>
        <Heading level={2} id="boundary-title">
          What Studio can see
        </Heading>
      </VStack>
      <div className="boundary-grid">
        {boundaries.map((boundary) => (
          <div key={boundary.title} className="boundary-item">
            <span className="feature-icon">{boundary.icon}</span>
            <VStack gap={1.5}>
              <Heading level={3}>{boundary.title}</Heading>
              <Text type="supporting" color="secondary" as="p">
                {boundary.detail}
              </Text>
            </VStack>
          </div>
        ))}
      </div>
      <div className="production-check">
        <VStack gap={2}>
          <Heading level={3}>Assess the deployed environment explicitly</Heading>
          <Text type="supporting" color="secondary" as="p">
            Studio remains offline. This separate command may contact configured
            services and must be intentionally invoked.
          </Text>
        </VStack>
        <Command command={productionCommand} title="Production readiness" />
      </div>
    </section>
  );
}

export function Dashboard({ snapshot }: { snapshot: StudioSnapshot }) {
  const upgradeDetail =
    snapshot.upgrade.actions.length === 0
      ? "Generator and identity engine match this release."
      : `${snapshot.upgrade.actions.length} planned action${
          snapshot.upgrade.actions.length === 1 ? "" : "s"
        }.`;

  return (
    <>
      <header id="overview" className="project-header">
        <VStack gap={2}>
          <Eyebrow icon={<ShieldCheck size={14} aria-hidden />}>
            Local security control plane
          </Eyebrow>
          <Heading level={1} type="display-1">
            {snapshot.project.name}
          </Heading>
          <Text type="code" color="secondary" className="project-path">
            {snapshot.project.rootDir}
          </Text>
        </VStack>
        <VStack gap={1} align="end" className="snapshot-stamp">
          <StatusLabel status="clear" label="Snapshot ready" />
          <Text type="supporting" color="secondary">
            {new Date(snapshot.generatedAt).toLocaleString()}
          </Text>
          <Text type="supporting" color="secondary">
            Point-in-time · restart Studio to refresh
          </Text>
        </VStack>
      </header>

      <section className="metric-grid" aria-label="Project security status">
        <StatusCard
          label="Security posture"
          status={snapshot.posture.status}
          value={snapshot.posture.label}
          detail={snapshot.posture.detail}
          href="#doctor"
        />
        <StatusCard
          label="Generated-code drift"
          status={snapshot.drift.status}
          value={snapshot.drift.label}
          detail={snapshot.drift.detail}
          href="#doctor"
        />
        <StatusCard
          label="Upgrade status"
          status={snapshot.upgrade.status}
          value={titleCase(snapshot.upgrade.status)}
          detail={upgradeDetail}
          href="#upgrades"
        />
        <StatusCard
          label="Production readiness"
          status={snapshot.productionReadiness.status}
          value={snapshot.productionReadiness.label}
          detail={snapshot.productionReadiness.detail}
          href="#boundary"
        />
      </section>

      <section className="focus-grid" aria-label="Recommended action and project contract">
        <Card className="next-action-card" padding={6} elevation="med">
          <VStack gap={5}>
            <VStack gap={2}>
              <Eyebrow icon={<Activity size={14} aria-hidden />}>
                Recommended next action
              </Eyebrow>
              <Heading level={2} type="display-3">
                {snapshot.nextAction.label}
              </Heading>
              <Text color="secondary" as="p" className="measure">
                {snapshot.nextAction.detail}
              </Text>
            </VStack>
            <Command command={snapshot.nextAction.command} title="Run next" />
          </VStack>
        </Card>

        <Card className="contract-card" padding={6}>
          <VStack gap={5}>
            <HStack gap={3} justify="between" align="start">
              <VStack gap={1.5}>
                <Eyebrow>Source-controlled metadata</Eyebrow>
                <Heading level={2}>Project contract</Heading>
              </VStack>
              <Badge variant="green" label={snapshot.project.preset} />
            </HStack>
            <MetadataList columns="single" label={{ position: "start", width: "9rem" }}>
              <MetadataListItem label="Package manager">
                <Text type="code">{snapshot.project.packageManager}</Text>
              </MetadataListItem>
              <MetadataListItem label="Runtime">
                <Text type="code">{snapshot.project.runtime}</Text>
              </MetadataListItem>
              <MetadataListItem label="Database">
                <Text type="code">
                  {snapshot.project.database ?? "Application-owned"}
                </Text>
              </MetadataListItem>
              <MetadataListItem label="Generator">
                <Text type="code">{snapshot.project.versions.generator}</Text>
              </MetadataListItem>
              <MetadataListItem label="Identity engine">
                <Text type="code">{snapshot.project.versions.engine}</Text>
              </MetadataListItem>
            </MetadataList>
          </VStack>
        </Card>
      </section>

      <section className="content-section" aria-labelledby="capabilities-title">
        <div className="section-heading">
          <VStack gap={1.5}>
            <Eyebrow>authenik8.json</Eyebrow>
            <Heading level={2} id="capabilities-title">
              Enabled capabilities
            </Heading>
          </VStack>
          <Text type="supporting" color="secondary">
            Declared features only
          </Text>
        </div>
        <div className="capability-grid">
          {snapshot.capabilities.map((capability) => (
            <CapabilityCard key={capability.id} capability={capability} />
          ))}
        </div>
      </section>

      <Findings snapshot={snapshot} />
      <Upgrades snapshot={snapshot} />
      <Boundary productionCommand={snapshot.productionReadiness.command} />
    </>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Authenik8 Studio overview">
        <span className="brand-mark" aria-hidden="true">
          A8
        </span>
        <span className="brand-copy">
          <strong>Authenik8</strong>
          <small>Studio</small>
        </span>
      </a>

      <nav aria-label="Studio sections">
        <Text type="supporting" className="nav-label">
          Workspace
        </Text>
        <ul>
          {navigation.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <a href={href}>
                <Icon size={16} aria-hidden />
                <span>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-boundary">
        <HStack gap={2} align="center">
          <StatusDot variant="success" label="Local-only server" isPulsing />
          <Text type="label">Local-only</Text>
        </HStack>
        <Text type="supporting" color="secondary" as="p">
          Read-only snapshot on 127.0.0.1. Stop with Ctrl+C.
        </Text>
      </div>
    </aside>
  );
}

function LoadingState() {
  return (
    <Card
      className="state-card"
      padding={8}
      role="status"
      aria-live="polite"
    >
      <VStack gap={4} align="center">
        <span className="loading-mark" aria-hidden="true">
          <ShieldCheck size={28} />
        </span>
        <VStack gap={1.5} align="center">
          <Heading level={2}>Building your local snapshot</Heading>
          <Text color="secondary" as="p">
            Reading safe project metadata and offline diagnostics…
          </Text>
        </VStack>
      </VStack>
    </Card>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card
      className="state-card error-state"
      padding={8}
      variant="red"
      role="alert"
    >
      <VStack gap={4} align="center">
        <TriangleAlert size={28} aria-hidden />
        <VStack gap={1.5} align="center">
          <Eyebrow>Studio could not load</Eyebrow>
          <Heading level={2}>Snapshot unavailable</Heading>
          <Text color="secondary" justify="center" as="p">
            {message}
          </Text>
          <Text type="supporting" color="secondary" justify="center" as="p">
            Stop Studio, address the terminal error, and run the command again.
          </Text>
        </VStack>
      </VStack>
    </Card>
  );
}

type ErrorBoundaryState = {
  message?: string;
};

class StudioErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      message:
        error instanceof Error
          ? error.message
          : "The Studio interface could not be rendered.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Authenik8 Studio render failure", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.message) return <ErrorState message={this.state.message} />;
    return this.props.children;
  }
}

export function App() {
  const [state, setState] = useState<SnapshotState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => {
      controller.abort(new Error("Studio snapshot loading timed out."));
    }, 10_000);
    void fetch("/api/snapshot", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Studio returned HTTP ${response.status}.`);
        }
        return parseSnapshot(await response.json());
      })
      .then((snapshot) => setState({ status: "loaded", snapshot }))
      .catch((error: unknown) => {
        if (disposed) return;
        const failure = controller.signal.aborted
          ? controller.signal.reason
          : error;
        setState({
          status: "error",
          message:
            failure instanceof Error
              ? failure.message
              : "The local snapshot could not be read.",
        });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <div className="studio-app" data-studio-ui="astryx">
      <a className="skip-link" href="#main-content">
        Skip to dashboard
      </a>
      <Sidebar />
      <main id="main-content">
        {state.status === "loading" && <LoadingState />}
        {state.status === "error" && <ErrorState message={state.message} />}
        {state.status === "loaded" && (
          <StudioErrorBoundary>
            <Dashboard snapshot={state.snapshot} />
          </StudioErrorBoundary>
        )}
        <footer>
          <HStack gap={2} align="center">
            <TerminalSquare size={14} aria-hidden />
            <span>Authenik8 Studio</span>
          </HStack>
          <span>Powered by Astryx · loopback only · read-only</span>
        </footer>
      </main>
    </div>
  );
}
