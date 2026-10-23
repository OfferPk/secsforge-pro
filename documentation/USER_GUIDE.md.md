# SECSForge Pro — Equipment Commissioning & Operations User Guide

**Product Version**: 1.0.0  
**Target Roles**: Semiconductor Equipment Integration Engineers, Fab Automation Technicians, MES Developers, OT Cybersecurity Specialists

---

## 1\. Quick Start Guide

### 1.1 Web Studio Launch

SECSForge Pro is completely self-contained with zero external runtime dependencies. Open `index.html` in any modern web browser:

\# Direct browser launch

google-chrome index.html

\# or with python local server

python3 \-m http.server 8080

Navigate to `http://localhost:8080` to access the full 5-tab cleanroom studio.

### 1.2 Standalone CLI Tool

The Python 3 CLI tool (`secforge-cli.py`) operates headlessly on Linux, macOS, and Windows:

\# Make executable

chmod \+x build/secforge-cli.py

\# Display help

./build/secforge-cli.py \--help

---

## 2\. Interactive Studio Tutorials

### Tutorial A: Encoding & Dissecting an S1F13 Establish Communications Request

1. Open **Tab 1: HSMS & SECS-II Studio**.  
2. Set **Stream** to `1`, **Function** to `13`, and **Wait Bit** to `True`.  
3. In the SML text area, input the equipment model and software revision:  
     
   \<L \[2\]  
     
     \<A \[14\] "LAM\_RESEARCH\_01"\>  
     
     \<A \[6\] "V4.2.1"\>  
     
   \>.  
     
4. Click **Encode Wire Packet**.  
5. Observe the instant byte-level breakdown in the **Raw Binary Wire Stream** and **SEMI Wire Frame Dissector** panels.  
6. Click **Export Wireshark PCAP** to generate an immediate `.pcap` file for network capture analysis.

### Tutorial B: Dispatching S2F41 Host Commands (Recipe Start)

1. Open **Tab 2: SEMI SxFy Library**.  
2. Select `S2F41 - Host Command Send (START Recipe)` from the preset dropdown.  
3. Configure **PPID** (e.g. `EUV_RESIST_COAT_12NM`).  
4. Click **Generate SxFy Message**.  
5. Click **Send to Studio** to transfer the complete hierarchical message structure directly into Tab 1 for binary synthesis.

### Tutorial C: 300mm FOUP Slot Map Optical Safety Auditing

1. Open **Tab 3: GEM State & 300mm FOUP**.  
2. Examine the 25-slot vertical matrix representing the front opening unified pod (FOUP).  
3. Click **Inject Cross-Slot Fault**.  
4. Notice that the carrier safety status immediately triggers **HAZARD: Transfer Halted** and highlights the exact physical slot indices.  
5. In production, this prevents wafer handling robot end-effectors from attempting to grasp damaged or tilted wafers.

### Tutorial D: Running the 10-Point Fab OT Cybersecurity Audit

1. Open **Tab 4: Fab OT Security Auditor**.  
2. Adjust your equipment's current configuration toggles (TLS encryption, Session ID verification, RCMD interlocks, recipe encryption).  
3. Click **Execute 10-Point Fab Audit**.  
4. Review your calculated compliance score (\$0 \\dots 100\$), posture rating, and prioritized actionable remediation steps.

---

## 3\. CLI Command Reference

### `encode` — Generate HSMS Binary Packet

./build/secforge-cli.py encode \\

  \--stream 2 \\

  \--func 41 \\

  \--wbit \\

  \--session 1 \\

  \--sysbytes 1001 \\

  \--mdln "EUV\_STEPPER\_01" \\

  \--softrev "v5.2.0"

### `decode` — Dissect Hex Wire Stream into SML

./build/secforge-cli.py decode "000000240001810d0000000003e90102410e4c414d5f52455345415243485f3031410656342e322e31"

### `pcap` — Generate Wireshark PCAP File

./build/secforge-cli.py pcap \--out semiconductor\_traffic.pcap

### `foup` — Audit 25-Slot Wafer Carrier

\# Audit a carrier with 25 slots (2=Occupied, 1=Empty, 3=Double, 4=Cross)

./build/secforge-cli.py foup \--slots "2,2,2,2,2,2,2,2,2,2,3,1,1,1,1,1,4,1,1,1,1,1,1,1,1"