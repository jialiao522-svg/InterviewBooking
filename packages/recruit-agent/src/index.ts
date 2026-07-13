import {
  queryCandidatesByStatus,
  updateCandidateStatus,
  ensureGmailAuthorized,
  sendEmail,
  getBookingBaseUrl,
  PENDING_INVITATION_STATUS,
  INVITED_STATUS,
} from "@interview-platform/shared-integrations";

export interface InviteDispatchResult {
  sent: number;
  failed: { name: string; email: string; error: string }[];
}

function buildInviteEmailBody(name: string, bookingLink: string): string {
  return [
    `${name} 您好，`,
    "",
    "感謝您參與本次徵選，請點擊以下連結選擇您方便的訪談時間：",
    bookingLink,
    "",
    "期待與您見面！",
  ].join("\n");
}

/**
 * Queries Notion for candidates pending invitation and sends each an invite
 * email containing their booking link. Only runs when explicitly triggered —
 * never as a side effect of filtering or Notion sync.
 */
export async function dispatchInvites(): Promise<InviteDispatchResult> {
  const candidates = await queryCandidatesByStatus(PENDING_INVITATION_STATUS);

  if (candidates.length === 0) {
    // eslint-disable-next-line no-console
    console.log("目前沒有待邀請的候選人，無需寄送。");
    return { sent: 0, failed: [] };
  }

  await ensureGmailAuthorized();
  const bookingBaseUrl = getBookingBaseUrl();

  const result: InviteDispatchResult = { sent: 0, failed: [] };

  for (const candidate of candidates) {
    try {
      const bookingLink = `${bookingBaseUrl}/book/${candidate.pageId}`;
      await sendEmail({
        to: candidate.email,
        subject: "訪談邀請",
        body: buildInviteEmailBody(candidate.name, bookingLink),
      });
      await updateCandidateStatus(candidate.pageId, INVITED_STATUS);
      result.sent += 1;
    } catch (error) {
      result.failed.push({
        name: candidate.name,
        email: candidate.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`邀請信寄送完成：成功 ${result.sent} 筆，失敗 ${result.failed.length} 筆。`);
  if (result.failed.length > 0) {
    for (const failure of result.failed) {
      // eslint-disable-next-line no-console
      console.log(`  - ${failure.name} <${failure.email}>：${failure.error}`);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--invite")) {
    await dispatchInvites();
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    "招募名單篩選已改為 Claude Code skill：在 Claude Code 中呼叫 recruit-filter skill 進行對話式篩選。",
  );
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
