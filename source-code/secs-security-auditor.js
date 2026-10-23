/**
 * SECSForge Pro - Cleanroom Fab OT Cybersecurity & Safety Auditor
 * Standards: SEMI E37, SEMI E30, IEC 62443-3-3, NIST SP 800-82r3
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SECSSecurityAuditor = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class SECSSecurityAuditor {
    constructor() {
      this.AUDIT_RULES = [
        {
          id: 'SECS_SEC_01',
          name: 'Cleartext HSMS Port 5000 Network Exposure',
          category: 'Transport Encryption & Segmentation',
          severity: 'HIGH',
          weight: 15,
          description: 'SEMI E37 HSMS transmits over cleartext TCP without native encryption. Without IPsec or mTLS proxy tunnels, industrial espionage and packet tampering can occur.',
          remediation: 'Encapsulate TCP 5000 traffic inside an IPsec tunnel (IKEv2/AES-GCM) or wireguard sidecar proxy. Isolate tool communications onto dedicated Micro-VLANs.'
        },
        {
          id: 'SECS_SEC_02',
          name: 'Default / Unverified Session ID (0x0000)',
          category: 'Authentication & Session Integrity',
          severity: 'CRITICAL',
          weight: 15,
          description: 'Using Session ID 0x0000 or failing to enforce strict Device ID binding allows rogue network nodes to inject unauthorized SxFy messages.',
          remediation: 'Assign non-zero, unique 16-bit Session IDs per equipment port. Reject any Select.req or Data message with mismatched Session IDs.'
        },
        {
          id: 'SECS_SEC_03',
          name: 'HSMS Timer (T3/T5/T6/T7/T8) Parameter Hardening',
          category: 'Availability & Protocol Timing',
          severity: 'MEDIUM',
          weight: 10,
          description: 'Overly relaxed T3 (Reply Timeout > 45s) or T7 (Not Selected Timeout > 60s) parameters expose tool control threads to denial-of-service starvation.',
          remediation: 'Configure tight deterministic timeouts: T3 = 10s-30s, T5 = 10s, T6 = 5s, T7 = 10s, T8 = 5s in accordance with SEMI E37 Section 9.'
        },
        {
          id: 'SECS_SEC_04',
          name: 'Destructive Host Command (S2F41 RCMD) Authorization',
          category: 'Operational Safety & Access Control',
          severity: 'CRITICAL',
          weight: 15,
          description: 'Accepting S2F41 commands like ABORT, STOP, or PURGE without local interlock verification can induce emergency recipe dumps and chamber thermal damage.',
          remediation: 'Require hardware safety interlock validation before processing destructive RCMDs. Implement RBAC authorization tokens in S2F41 parameter lists.'
        },
        {
          id: 'SECS_SEC_05',
          name: 'Cleartext Recipe (S7F3 / S7F4) IP Protection',
          category: 'Intellectual Property Protection',
          severity: 'HIGH',
          weight: 10,
          description: 'Semiconductor process recipes containing proprietary gas ratios, temperatures, and etching formulas are transferred in unencrypted binary payloads.',
          remediation: 'Encrypt S7F3 PPBODY payloads using AES-256 prior to SECS-II item packaging, or restrict S7 recipe downloads to verified encrypted staging servers.'
        },
        {
          id: 'SECS_SEC_06',
          name: 'Spooling Buffer Memory Exhaustion Defense',
          category: 'Denial of Service Mitigation',
          severity: 'MEDIUM',
          weight: 10,
          description: 'During host communication drops, unbounded GEM message spooling can exhaust tool memory and freeze real-time controller kernel loops.',
          remediation: 'Set MAX_SPOOL_TRANSMIT limits, configure ring-buffer FIFO discard policies, and alarm when spool memory consumption reaches 80% capacity.'
        },
        {
          id: 'SECS_SEC_07',
          name: 'Unrestricted Remote Control Transition (ONLINE_REMOTE)',
          category: 'Equipment Control Hierarchy',
          severity: 'HIGH',
          weight: 10,
          description: 'Transitioning tool from LOCAL to REMOTE via network message without cleanroom operator physical touchpanel confirmation creates personnel hazards.',
          remediation: 'Mandate SEMI E30 Section 5.4 physical operator acknowledgment on the tool touchpanel before allowing host-directed REMOTE transition.'
        },
        {
          id: 'SECS_SEC_08',
          name: 'Event Report (S6F11) Flood Rate-Limiting',
          category: 'Network Resilience',
          severity: 'MEDIUM',
          weight: 5,
          description: 'Unthrottled collection events (CEID) during high-frequency sensor reporting can cause broadcast storms and packet drops across MES gateways.',
          remediation: 'Implement token-bucket rate limiting on tool S6F11 egress. Filter non-essential trace variables to dedicated high-speed out-of-band links.'
        },
        {
          id: 'SECS_SEC_09',
          name: 'Wafer Carrier FOUP Slot-Map Safety Verification',
          category: 'Mechanical Safety & Material Integrity',
          severity: 'HIGH',
          weight: 5,
          description: 'Bypassing optical slot-map scanning before initiating wafer transfer can lead to robotic end-effector crashes on cross-slotted or double-slotted wafers.',
          remediation: 'Enforce SEMI E87 validation: reject carrier clamp commands if slot map contains state 3 (double-slot) or state 4 (cross-slot).'
        },
        {
          id: 'SECS_SEC_10',
          name: 'SECS-II Item Length Header Boundary Protection',
          category: 'Memory Safety & Protocol Robustness',
          severity: 'MEDIUM',
          weight: 5,
          description: 'Malformed length bytes (2-byte or 3-byte format headers declaring lengths exceeding buffer boundaries) can trigger integer overflows in legacy tool C drivers.',
          remediation: 'Enforce strict packet boundary sanity checks before allocating memory for SECS-II items. Reject any item declaring length > 16 MB.'
        }
      ];
    }

    /**
     * Executes the 10-point cleanroom fab security audit on tool configuration
     */
    auditEquipment(config) {
      const findings = [];
      let totalDeductions = 0;

      // Rule 1: Transport encryption
      if (!config.hasTlsOrIpsec) {
        findings.push(this.createFinding('SECS_SEC_01', 'HSMS port 5000 is directly exposed to plain TCP with no IPsec/mTLS wrapper.'));
        totalDeductions += 15;
      }

      // Rule 2: Session ID
      if (config.sessionId === 0 || config.sessionId === undefined || !config.enforceSessionId) {
        findings.push(this.createFinding('SECS_SEC_02', `Session ID is ${config.sessionId || 0} or not strictly verified on ingress packets.`));
        totalDeductions += 15;
      }

      // Rule 3: HSMS Timers
      const t3 = config.t3Timeout || 45;
      const t7 = config.t7Timeout || 60;
      if (t3 > 30 || t7 > 30 || t3 < 5) {
        findings.push(this.createFinding('SECS_SEC_03', `HSMS T3 timeout (${t3}s) or T7 timeout (${t7}s) outside hardened operational window (5-30s).`));
        totalDeductions += 10;
      }

      // Rule 4: Destructive RCMD authorization
      if (!config.rcmdSafetyInterlock) {
        findings.push(this.createFinding('SECS_SEC_04', 'Destructive S2F41 commands (ABORT/STOP) accepted without hardware interlock confirmation.'));
        totalDeductions += 15;
      }

      // Rule 5: Cleartext Recipe
      if (!config.encryptedRecipes) {
        findings.push(this.createFinding('SECS_SEC_05', 'Process recipes (S7F3) transferred in plain unencrypted SECS-II byte streams.'));
        totalDeductions += 10;
      }

      // Rule 6: Spooling limit
      if (!config.maxSpoolLimit || config.maxSpoolLimit > 10000) {
        findings.push(this.createFinding('SECS_SEC_06', `Spooling buffer limit (${config.maxSpoolLimit || 'unbounded'}) exceeds safe memory boundary.`));
        totalDeductions += 10;
      }

      // Rule 7: Remote control transition
      if (!config.operatorTouchpanelAckRequired) {
        findings.push(this.createFinding('SECS_SEC_07', 'Remote online state transition permitted without cleanroom physical touchpanel confirmation.'));
        totalDeductions += 10;
      }

      // Rule 8: Event report rate-limiting
      if (!config.eventRateLimiting) {
        findings.push(this.createFinding('SECS_SEC_08', 'S6F11 event reports unthrottled; potential network saturation vector during chamber faults.'));
        totalDeductions += 5;
      }

      // Rule 9: FOUP slot-map validation
      if (!config.enforceSlotMapValidation) {
        findings.push(this.createFinding('SECS_SEC_09', 'Carrier clamp and wafer transfer allowed without optical double/cross-slot check.'));
        totalDeductions += 5;
      }

      // Rule 10: Item length validation
      if (!config.enforceLengthSanityChecks) {
        findings.push(this.createFinding('SECS_SEC_10', 'SECS-II item length parser lacks upper bound verification on 3-byte format headers.'));
        totalDeductions += 5;
      }

      const score = Math.max(0, 100 - totalDeductions);
      let posture = 'POOR';
      if (score >= 90) posture = 'EXCELLENT';
      else if (score >= 75) posture = 'GOOD';
      else if (score >= 60) posture = 'ACCEPTABLE';

      return {
        auditTimestamp: new Date().toISOString(),
        score,
        posture,
        totalRulesAudited: this.AUDIT_RULES.length,
        findingsCount: findings.length,
        criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
        highCount: findings.filter(f => f.severity === 'HIGH').length,
        mediumCount: findings.filter(f => f.severity === 'MEDIUM').length,
        findings
      };
    }

    createFinding(ruleId, evidence) {
      const rule = this.AUDIT_RULES.find(r => r.id === ruleId);
      return {
        ruleId,
        ruleName: rule.name,
        category: rule.category,
        severity: rule.severity,
        evidence,
        description: rule.description,
        remediation: rule.remediation
      };
    }
  }

  return SECSSecurityAuditor;
});
