/**
 * SECSForge Pro - Fab Conduit Security & IDS Rule Synthesizer
 * Generates Linux nftables isolation conduits and Suricata L7 intrusion signatures
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SECSConfigSynthesizer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class SECSConfigSynthesizer {
    /**
     * Synthesizes Linux nftables firewall rules for semiconductor tool isolation
     */
    static generateNftables(options = {}) {
      const toolIp = options.toolIp || '10.100.4.15';
      const mesHostIp = options.mesHostIp || '10.100.1.1';
      const hsmsPort = options.hsmsPort || 5000;
      const toolInterface = options.toolInterface || 'eth0';

      return `# ==============================================================================
# SECSForge Pro - Linux nftables Cleanroom Equipment Conduit Rules
# Standard: SEMI E37 (HSMS-SS) TCP Port ${hsmsPort} Micro-Segmentation
# Target Equipment IP: ${toolIp} | MES Host IP: ${mesHostIp}
# ==============================================================================

table inet filter {
    # Set of authorized Semiconductor Manufacturing Hosts
    set mes_authorized_hosts {
        type ipv4_addr
        elements = { ${mesHostIp} }
    }

    chain input {
        type filter hook input priority 0; policy drop;

        # Allow established and related connections
        ct state established,related accept

        # Drop invalid packet state
        ct state invalid drop

        # Allow loopback interface
        iif "lo" accept

        # Rate-limit ICMP diagnostics
        ip protocol icmp icmp type echo-request limit rate 5/second accept

        # HSMS Connection Rate-Limiting (Prevents Select.req syn flood)
        iif "${toolInterface}" ip saddr @mes_authorized_hosts tcp dport ${hsmsPort} ct state new meter hsms_flood_meter { ip saddr limit rate 10/second burst 20 packets } accept

        # Allow authorized HSMS traffic between tool and MES host
        iif "${toolInterface}" ip saddr @mes_authorized_hosts tcp dport ${hsmsPort} counter accept

        # Log and drop all unauthorized attempts to access HSMS port
        iif "${toolInterface}" tcp dport ${hsmsPort} log prefix "[SECS-ROGUE-ATTEMPT] " counter drop

        # Default drop counter
        counter drop
    }

    chain forward {
        type filter hook forward priority 0; policy drop;
    }

    chain output {
        type filter hook output priority 0; policy accept;
        # Restrict outbound TCP 5000 initiator connections strictly to MES host
        tcp sport ${hsmsPort} ip daddr != @mes_authorized_hosts log prefix "[SECS-ROGUE-EGRESS] " counter drop
    }
}
`;
    }

    /**
     * Synthesizes Suricata L7 Intrusion Detection (IDS) signatures for SECS/GEM
     */
    static generateSuricataRules(options = {}) {
      const hsmsPort = options.hsmsPort || 5000;
      const baseSid = options.baseSid || 400100;

      return `# ==============================================================================
# SECSForge Pro - Suricata L7 Intrusion Detection Signatures
# Protocol: SEMI E37 (HSMS) / SEMI E5 (SECS-II) / SEMI E30 (GEM)
# Default TCP Port: ${hsmsPort}
# ==============================================================================

# Rule 1: Detect Destructive S2F41 RCMD ABORT/STOP Command
alert tcp any any -> any ${hsmsPort} (msg:"SECSFORGE - Destructive S2F41 RCMD ABORT/STOP Detected"; \\
    flow:to_server,established; \\
    content:"|00 00|"; depth:4; \\
    content:"|02 29|"; offset:6; depth:2; \\
    pcre:"/(ABORT|STOP|PURGE|EMERGENCY)/i"; \\
    classtype:bad-unknown; sid:${baseSid + 1}; rev:1;)

# Rule 2: Detect HSMS Separate.req Termination Message (SType 0x09)
alert tcp any any -> any ${hsmsPort} (msg:"SECSFORGE - HSMS Session Separation Request (SType 0x09)"; \\
    flow:to_server,established; \\
    content:"|09|"; offset:9; depth:1; \\
    threshold:type limit, track by_src, count 1, seconds 60; \\
    classtype:policy-violation; sid:${baseSid + 2}; rev:1;)

# Rule 3: Detect Abnormal HSMS Reject.req Flood (SType 0x07)
alert tcp any any -> any ${hsmsPort} (msg:"SECSFORGE - HSMS Packet Rejection Flood (SType 0x07)"; \\
    flow:established; \\
    content:"|07|"; offset:9; depth:1; \\
    threshold:type threshold, track by_src, count 5, seconds 10; \\
    classtype:attempted-dos; sid:${baseSid + 3}; rev:1;)

# Rule 4: Detect Unencrypted Process Program (Recipe) Transfer (S7F3)
alert tcp any any -> any ${hsmsPort} (msg:"SECSFORGE - Cleartext Process Recipe Upload (S7F3 PP-Send)"; \\
    flow:to_server,established; \\
    content:"|07 03|"; offset:6; depth:2; \\
    classtype:policy-violation; sid:${baseSid + 4}; rev:1;)

# Rule 5: Detect SECS-II 3-Byte Length Header Integer Overflow Anomaly
alert tcp any ${hsmsPort} -> any any (msg:"SECSFORGE - SECS-II Anomalous 3-Byte Item Header"; \\
    flow:established; \\
    byte_test:1,&,0x03,14; \\
    content:"|03|"; offset:14; depth:1; \\
    classtype:protocol-command-decode; sid:${baseSid + 5}; rev:1;)
`;
    }
  }

  return SECSConfigSynthesizer;
});
