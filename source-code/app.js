/**
 * SECSForge Pro - Web Application Controller
 * Handles interactive tabs, real-time SML encoding, GEM state transitions, FOUP matrix, and PCAP export
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new window.SECSProtocolEngine();
  const gem = new window.GEMStateEngine.GEMStateEngine();
  const auditor = new window.SECSSecurityAuditor();
  const synthesizer = window.SECSConfigSynthesizer;

  let currentPacketBytes = null;

  // ---------------------------------------------------------------------------
  // Tab Navigation
  // ---------------------------------------------------------------------------
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // ---------------------------------------------------------------------------
  // Tab 1: HSMS & SECS-II Studio
  // ---------------------------------------------------------------------------
  const sessionIdInput = document.getElementById('hsms-session-id');
  const sysBytesInput = document.getElementById('hsms-sys-bytes');
  const streamInput = document.getElementById('hsms-stream');
  const funcInput = document.getElementById('hsms-func');
  const wbitSelect = document.getElementById('hsms-wbit');
  const stypeSelect = document.getElementById('hsms-stype');
  const smlInputArea = document.getElementById('sml-input-area');

  const hexOutput = document.getElementById('hex-output');
  const dissectedOutput = document.getElementById('dissected-output');
  const btnEncode = document.getElementById('btn-encode-hsms');
  const btnSampleS1F1 = document.getElementById('btn-sample-s1f1');
  const btnSampleS2F41 = document.getElementById('btn-sample-s2f41');

  function encodeCurrentStudioPacket() {
    try {
      const sessionId = parseInt(sessionIdInput.value, 10) || 1;
      const systemBytes = parseInt(sysBytesInput.value, 10) || 1001;
      const stream = parseInt(streamInput.value, 10) || 1;
      const functionNum = parseInt(funcInput.value, 10) || 1;
      const wBit = wbitSelect.value === 'true';
      const sType = parseInt(stypeSelect.value, 10) || 0;

      const header = engine.buildHSMSHeader({
        sessionId,
        systemBytes,
        stream,
        functionNum,
        wBit,
        sType
      });

      let bodyBytes = new Uint8Array(0);
      let parsedItem = null;

      if (sType === engine.S_TYPE.DATA_MESSAGE) {
        const parsedSML = engine.parseSML(smlInputArea.value);
        if (parsedSML.item) {
          parsedItem = parsedSML.item;
          bodyBytes = engine.encodeSECSItem(parsedItem);
        }
      }

      const packet = engine.wrapHSMSPacket(header, bodyBytes);
      currentPacketBytes = packet;

      // Hex string format
      const hexStr = Array.from(packet)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      hexOutput.textContent = hexStr;

      // Dissection format
      const parsed = engine.parseHSMSPacket(packet);
      const isControl = parsed.header.isControlMessage;
      let text = `Length: ${parsed.messageLength} bytes (10-byte header + ${parsed.bodyBytes.length}-byte body)\n`;
      text += `Header: S${parsed.header.stream}F${parsed.header.functionNum} ${parsed.header.wBit ? 'W' : ''} `;
      text += `[Session: ${parsed.header.sessionId}, SType: ${parsed.header.sTypeName}, TxID: ${parsed.header.systemBytes}]\n`;

      if (!isControl && parsed.secsItems) {
        text += `Body SML:\n${engine.itemToSML(parsed.secsItems, 0)}`;
      } else if (isControl) {
        text += `Control Message: No SECS-II Body`;
      }
      dissectedOutput.textContent = text;
    } catch (err) {
      hexOutput.textContent = `Encoding Error: ${err.message}`;
      dissectedOutput.textContent = `Error: ${err.message}`;
    }
  }

  btnEncode.addEventListener('click', encodeCurrentStudioPacket);

  btnSampleS1F1.addEventListener('click', () => {
    streamInput.value = 1;
    funcInput.value = 1;
    wbitSelect.value = 'true';
    stypeSelect.value = '0';
    smlInputArea.value = '';
    encodeCurrentStudioPacket();
  });

  btnSampleS2F41.addEventListener('click', () => {
    streamInput.value = 2;
    funcInput.value = 41;
    wbitSelect.value = 'true';
    stypeSelect.value = '0';
    smlInputArea.value = `<L [2]
  <A [5] "START">
  <L [1]
    <L [2]
      <A [4] "PPID">
      <A [18] "OXIDE_CMP_POLISH_1">
    >
  >
>.`;
    encodeCurrentStudioPacket();
  });

  // Copy Buttons
  document.getElementById('btn-copy-hex').addEventListener('click', () => {
    navigator.clipboard.writeText(hexOutput.textContent);
    alert('Hex bytes copied to clipboard!');
  });

  document.getElementById('btn-copy-sml').addEventListener('click', () => {
    navigator.clipboard.writeText(dissectedOutput.textContent);
    alert('Dissected SML copied to clipboard!');
  });

  // PCAP Download
  function downloadBlob(bytes, filename, type = 'application/octet-stream') {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-download-pcap').addEventListener('click', () => {
    if (!currentPacketBytes) encodeCurrentStudioPacket();
    if (currentPacketBytes) {
      const pcap = engine.generatePCAP([currentPacketBytes]);
      downloadBlob(pcap, 'secforge-capture.pcap');
    }
  });

  // ---------------------------------------------------------------------------
  // Tab 2: Standard SxFy Library
  // ---------------------------------------------------------------------------
  const templateSelect = document.getElementById('template-select');
  const tplMdln = document.getElementById('tpl-mdln');
  const tplSoftrev = document.getElementById('tpl-softrev');
  const tplPpid = document.getElementById('tpl-ppid');
  const btnGenTemplate = document.getElementById('btn-generate-template');
  const btnTransfer = document.getElementById('btn-transfer-to-studio');
  const tplSmlPreview = document.getElementById('tpl-sml-preview');
  const tplHexPreview = document.getElementById('tpl-hex-preview');

  let currentTemplateMsg = null;

  function renderSelectedTemplate() {
    const tplName = templateSelect.value;
    const msg = engine.createStandardMessage(tplName, {
      mdln: tplMdln.value,
      softrev: tplSoftrev.value,
      ppid: tplPpid.value
    });
    currentTemplateMsg = msg;

    let smlText = `S${msg.stream}F${msg.func} ${msg.wBit ? 'W' : ''}\n`;
    let encodedBody = new Uint8Array(0);
    if (msg.item) {
      smlText += engine.itemToSML(msg.item, 0);
      encodedBody = engine.encodeSECSItem(msg.item);
    } else {
      smlText += `/* Header Only / No Body */`;
    }
    smlText += `\n. /* ${msg.headerDesc} */`;
    tplSmlPreview.textContent = smlText;

    const header = engine.buildHSMSHeader({
      stream: msg.stream,
      functionNum: msg.func,
      wBit: msg.wBit,
      sessionId: 1,
      systemBytes: 2001
    });
    const packet = engine.wrapHSMSPacket(header, encodedBody);
    const hex = Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ');
    tplHexPreview.textContent = hex;
  }

  btnGenTemplate.addEventListener('click', renderSelectedTemplate);
  templateSelect.addEventListener('change', renderSelectedTemplate);

  btnTransfer.addEventListener('click', () => {
    if (!currentTemplateMsg) renderSelectedTemplate();
    streamInput.value = currentTemplateMsg.stream;
    funcInput.value = currentTemplateMsg.func;
    wbitSelect.value = currentTemplateMsg.wBit ? 'true' : 'false';
    stypeSelect.value = '0';
    if (currentTemplateMsg.item) {
      smlInputArea.value = engine.itemToSML(currentTemplateMsg.item, 0) + '.';
    } else {
      smlInputArea.value = '';
    }
    // Switch to studio tab
    document.querySelector('[data-tab="tab-studio"]').click();
    encodeCurrentStudioPacket();
  });

  // ---------------------------------------------------------------------------
  // Tab 3: GEM State Machine & 300mm FOUP Simulator
  // ---------------------------------------------------------------------------
  const ctrlStateDisplay = document.getElementById('current-control-state');
  const commStateDisplay = document.getElementById('current-comm-state');
  const gemHistoryLog = document.getElementById('gem-history-log');
  const foupMatrix = document.getElementById('foup-matrix');
  const foupSafetyStatus = document.getElementById('foup-safety-status');

  function updateGEMUI() {
    ctrlStateDisplay.textContent = gem.controlState;
    commStateDisplay.textContent = gem.commState;

    if (gem.controlState === window.GEMStateEngine.CONTROL_STATES.ONLINE_REMOTE) {
      ctrlStateDisplay.style.color = 'var(--color-clean-green)';
    } else if (gem.controlState === window.GEMStateEngine.CONTROL_STATES.EQUIPMENT_OFFLINE) {
      ctrlStateDisplay.style.color = 'var(--color-laser-red)';
    } else {
      ctrlStateDisplay.style.color = 'var(--color-wafer-gold)';
    }

    const logText = gem.history.map(h => `[${h.timestamp.slice(11, 19)}] ${h.action} -> Ctrl: ${h.controlState} | Comm: ${h.commState}`).join('\n');
    gemHistoryLog.textContent = logText;
  }

  document.getElementById('btn-comm-enable').addEventListener('click', () => {
    gem.triggerCommEvent('ENABLE_COMM');
    updateGEMUI();
  });
  document.getElementById('btn-comm-establish').addEventListener('click', () => {
    gem.triggerCommEvent('ESTABLISH_COMM_SUCCESS');
    updateGEMUI();
  });
  document.getElementById('btn-ctrl-req-online').addEventListener('click', () => {
    gem.triggerControlEvent('REQ_ONLINE');
    updateGEMUI();
  });
  document.getElementById('btn-ctrl-accept-online').addEventListener('click', () => {
    gem.triggerControlEvent('ONLINE_ACCEPTED');
    updateGEMUI();
  });
  document.getElementById('btn-ctrl-remote').addEventListener('click', () => {
    gem.triggerControlEvent('SWITCH_REMOTE');
    updateGEMUI();
  });
  document.getElementById('btn-ctrl-local').addEventListener('click', () => {
    gem.triggerControlEvent('SWITCH_LOCAL');
    updateGEMUI();
  });
  document.getElementById('btn-ctrl-offline').addEventListener('click', () => {
    gem.triggerControlEvent('SWITCH_OFFLINE');
    updateGEMUI();
  });

  // Render 300mm FOUP Matrix (25 slots)
  function renderFOUP() {
    foupMatrix.innerHTML = '';
    const audit = gem.auditCarrier();

    if (audit.isSafeForRobotics) {
      foupSafetyStatus.textContent = `Safe for Robotics (${audit.waferCount} Wafers)`;
      foupSafetyStatus.className = 'badge badge-green';
    } else {
      foupSafetyStatus.textContent = `HAZARD: Transfer Halted (${audit.issues.length} faults)`;
      foupSafetyStatus.className = 'badge badge-gold';
      foupSafetyStatus.style.background = 'rgba(255, 61, 113, 0.2)';
      foupSafetyStatus.style.color = 'var(--color-laser-red)';
    }

    for (let i = 24; i >= 0; i--) { // Top to bottom (Slot 25 down to Slot 1)
      const slotNum = i + 1;
      const state = gem.slots[i];
      const slotRow = document.createElement('div');
      let stateClass = 'empty';
      let stateName = 'Empty';

      if (state === window.GEMStateEngine.SLOT_STATES.CORRECTLY_OCCUPIED) {
        stateClass = 'occupied';
        stateName = 'Occupied (Wafer Present)';
      } else if (state === window.GEMStateEngine.SLOT_STATES.DOUBLE_SLOTTED) {
        stateClass = 'double';
        stateName = 'DOUBLE SLOTTED (ERROR)';
      } else if (state === window.GEMStateEngine.SLOT_STATES.CROSS_SLOTTED) {
        stateClass = 'cross';
        stateName = 'CROSS SLOTTED (ERROR)';
      }

      slotRow.className = `foup-slot ${stateClass}`;
      slotRow.innerHTML = `
        <span>Slot ${slotNum.toString().padStart(2, '0')}: <strong>${stateName}</strong></span>
        <div style="display:flex; gap:4px;">
          <button class="slot-btn" data-slot="${i}" data-state="2">Load</button>
          <button class="slot-btn" data-slot="${i}" data-state="1">Empty</button>
          <button class="slot-btn" data-slot="${i}" data-state="4" style="color:#ffd54f;">Cross</button>
          <button class="slot-btn" data-slot="${i}" data-state="3" style="color:#ff3d71;">Double</button>
        </div>
      `;
      foupMatrix.appendChild(slotRow);
    }

    // Attach click listeners to slot buttons
    document.querySelectorAll('.slot-btn').forEach(b => {
      b.addEventListener('click', (e) => {
        const slotIdx = parseInt(e.target.dataset.slot, 10);
        const newState = parseInt(e.target.dataset.state, 10);
        gem.setSlot(slotIdx, newState);
        renderFOUP();
      });
    });
  }

  document.getElementById('btn-foup-fill').addEventListener('click', () => {
    for (let i = 0; i < 25; i++) gem.setSlot(i, window.GEMStateEngine.SLOT_STATES.CORRECTLY_OCCUPIED);
    renderFOUP();
  });
  document.getElementById('btn-foup-empty').addEventListener('click', () => {
    for (let i = 0; i < 25; i++) gem.setSlot(i, window.GEMStateEngine.SLOT_STATES.EMPTY);
    renderFOUP();
  });
  document.getElementById('btn-foup-hazard').addEventListener('click', () => {
    gem.setSlot(7, window.GEMStateEngine.SLOT_STATES.CROSS_SLOTTED);
    gem.setSlot(14, window.GEMStateEngine.SLOT_STATES.DOUBLE_SLOTTED);
    renderFOUP();
  });

  // ---------------------------------------------------------------------------
  // Tab 4: Fab OT Security Auditor
  // ---------------------------------------------------------------------------
  const btnRunAudit = document.getElementById('btn-run-audit');
  const auditScoreNum = document.getElementById('audit-score-num');
  const auditScorePosture = document.getElementById('audit-score-posture');
  const auditFindingsList = document.getElementById('audit-findings-list');

  function executeAudit() {
    const config = {
      hasTlsOrIpsec: document.getElementById('cfg-tls').value === 'true',
      enforceSessionId: document.getElementById('cfg-session').value === 'true',
      sessionId: document.getElementById('cfg-session').value === 'true' ? 101 : 0,
      rcmdSafetyInterlock: document.getElementById('cfg-rcmd').value === 'true',
      encryptedRecipes: document.getElementById('cfg-recipe').value === 'true',
      enforceSlotMapValidation: document.getElementById('cfg-slotmap').value === 'true',
      t3Timeout: 15,
      t7Timeout: 15,
      maxSpoolLimit: 2000,
      operatorTouchpanelAckRequired: true,
      eventRateLimiting: true,
      enforceLengthSanityChecks: true
    };

    const result = auditor.auditEquipment(config);
    auditScoreNum.textContent = result.score;
    auditScorePosture.textContent = `${result.posture} POSTURE (${result.findingsCount} Findings)`;

    if (result.score >= 80) {
      auditScoreNum.style.color = 'var(--color-clean-green)';
      auditScorePosture.style.color = 'var(--color-clean-green)';
    } else if (result.score >= 60) {
      auditScoreNum.style.color = 'var(--color-wafer-gold)';
      auditScorePosture.style.color = 'var(--color-wafer-gold)';
    } else {
      auditScoreNum.style.color = 'var(--color-laser-red)';
      auditScorePosture.style.color = 'var(--color-laser-red)';
    }

    auditFindingsList.innerHTML = '';
    if (result.findings.length === 0) {
      auditFindingsList.innerHTML = '<div style="padding:16px; color:var(--color-clean-green); text-align:center;">All 10 SEMI Fab Security Checks Passed! Posture is Fully Hardened.</div>';
    } else {
      result.findings.forEach(f => {
        const item = document.createElement('div');
        item.className = `finding-item ${f.severity}`;
        item.innerHTML = `
          <div class="finding-header">
            <span>[${f.ruleId}] ${f.ruleName}</span>
            <span class="badge" style="background:rgba(255,255,255,0.1);">${f.severity}</span>
          </div>
          <div class="finding-desc">${f.evidence} ${f.description}</div>
          <div class="finding-remed"><strong>Remediation:</strong> ${f.remediation}</div>
        `;
        auditFindingsList.appendChild(item);
      });
    }
  }

  btnRunAudit.addEventListener('click', executeAudit);

  // ---------------------------------------------------------------------------
  // Tab 5: Conduit Firewall & PCAP
  // ---------------------------------------------------------------------------
  const nftablesPreview = document.getElementById('nftables-preview');
  const suricataPreview = document.getElementById('suricata-preview');

  function renderConduitRules() {
    nftablesPreview.textContent = synthesizer.generateNftables();
    suricataPreview.textContent = synthesizer.generateSuricataRules();
  }

  document.getElementById('btn-copy-nftables').addEventListener('click', () => {
    navigator.clipboard.writeText(nftablesPreview.textContent);
    alert('Linux nftables rules copied to clipboard!');
  });

  document.getElementById('btn-copy-suricata').addEventListener('click', () => {
    navigator.clipboard.writeText(suricataPreview.textContent);
    alert('Suricata L7 signatures copied to clipboard!');
  });

  document.getElementById('btn-download-sample-pcap').addEventListener('click', () => {
    // Generate a multi-packet sample capture (S1F13, S1F14, S2F41, S2F42)
    const p1 = engine.wrapHSMSPacket(
      engine.buildHSMSHeader({ stream: 1, functionNum: 13, wBit: true, sessionId: 1, systemBytes: 101 }),
      engine.encodeSECSItem({ type: 'L', value: [{ type: 'A', value: 'ASML_TWINSCAN_EUV' }, { type: 'A', value: 'v3.4.1' }] })
    );
    const p2 = engine.wrapHSMSPacket(
      engine.buildHSMSHeader({ stream: 1, functionNum: 14, wBit: false, sessionId: 1, systemBytes: 101 }),
      engine.encodeSECSItem({ type: 'L', value: [{ type: 'B', value: [0x00] }, { type: 'L', value: [{ type: 'A', value: 'FAB_MES' }, { type: 'A', value: 'v9.0' }] }] })
    );
    const p3 = engine.wrapHSMSPacket(
      engine.buildHSMSHeader({ stream: 2, functionNum: 41, wBit: true, sessionId: 1, systemBytes: 102 }),
      engine.encodeSECSItem({ type: 'L', value: [{ type: 'A', value: 'START' }, { type: 'L', value: [{ type: 'L', value: [{ type: 'A', value: 'PPID' }, { type: 'A', value: 'EUV_5NM_GATE' }] }] }] })
    );

    const pcapBytes = engine.generatePCAP([p1, p2, p3]);
    downloadBlob(pcapBytes, 'secs-gem-multi-stream.pcap');
  });

  // Initial runs
  encodeCurrentStudioPacket();
  renderSelectedTemplate();
  renderFOUP();
  executeAudit();
  renderConduitRules();
});
