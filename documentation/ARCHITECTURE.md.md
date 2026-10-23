# SECSForge Pro — System Architecture & Technical Specifications

**Version**: 1.0.0  
**Standards Compliance**: SEMI E37 (HSMS-SS/GS), SEMI E5 (SECS-II), SEMI E30 (GEM), SEMI E87 (Carrier Management), SEMI E90 (Substrate Tracking), IEC 62443-3-3  
**Classification**: Commercial Semiconductor Manufacturing Protocol Studio, Codec, & OT Cybersecurity Engine

---

## 1\. Architectural Overview

SECSForge Pro provides a unified, zero-infrastructure protocol engineering suite for semiconductor wafer fabrication equipment. It eliminates dependency on proprietary, multi-thousand-dollar Windows-bound DLLs by implementing the complete SEMI E37 (HSMS-SS) and SEMI E5 (SECS-II) protocol specifications in standards-compliant ES6+ and standalone Python 3\.

\+-----------------------------------------------------------------------------------------+

\|                                    SECSForge Pro Studio                                 \|

\|                                                                                         \|

\|  \+--------------------+  \+----------------------+  \+---------------------------------+  \|

\|  \|  SEMI E37 Codec    \|  \|  SECS-II Item Engine \|  \|  SEMI E30 GEM State Machine     \|  \|

\|  \|  \- 4-Byte Length   \|  \|  \- List / ASCII / B  \|  \|  \- Comm State (Not / Comm)      \|  \|

\|  \|  \- 10-Byte Header  \|  \|  \- U1..U8 / I1..I8   \|  \|  \- Control State (Local/Remote) \|  \|

\|  \|  \- SType Dissector \|  \|  \- F4 / F8 Floats    \|  \|  \- 300mm FOUP Slot Map Auditor  \|  \|

\|  \+--------------------+  \+----------------------+  \+---------------------------------+  \|

\|            \|                        \|                               \|                   \|

\|            \+------------------------+-------------------------------+                   \|

\|                                     \|                                                   \|

\|                        \+-------------------------+                                      \|

\|                        \|  SML Parser & Generator \|                                      \|

\|                        \|  \- SxFy Bidirectional   \|                                      \|

\|                        \+-------------------------+                                      \|

\|                                     \|                                                   \|

\|            \+------------------------+-------------------------------+                   \|

\|            \|                                                        \|                   \|

\|  \+--------------------+                                  \+--------------------+         \|

\|  \| 10-Point Fab OT    \|                                  \| Gateway Defense    \|         \|

\|  \| Security Auditor   \|                                  \| \- Linux nftables   \|         \|

\|  \| \- IEC 62443 Matrix \|                                  \| \- Suricata L7 IDS  \|         \|

\|  \| \- Recipe Leakage   \|                                  \| \- Libpcap Exporter \|         \|

\|  \+--------------------+                                  \+--------------------+         \|

\+-----------------------------------------------------------------------------------------+

                                      \|

                  \[ TCP Port 5000 (Ethernet Wire Stream) \]

                                      \|

          \+---------------------------+---------------------------+

          \|                                                       \|

  \+---------------+                                       \+---------------+

  \|  Host MES/CIM \|                                       \| 300mm Wafer   \|

  \|  Station      \|                                       \| Fab Tool      \|

  \+---------------+                                       \+---------------+

---

## 2\. Protocol Specifications & Framing

### 2.1 SEMI E37 HSMS Wire Framing

Every message on the HSMS TCP/IP link (default Port 5000\) begins with a 4-byte big-endian Message Length followed by a 10-byte Header:

\$\$\\text{Packet} \= \[\\text{Message Length (4B)}\] \+ \[\\text{HSMS Header (10B)}\] \+ \[\\text{SECS-II Body (} N \\text{ Bytes)}\]\$\$

Where: \$\$\\text{Message Length} \= 10 \+ N\$\$

#### 10-Byte Header Structure:

- **Bytes 0–1 (Session ID / Device ID)**: 16-bit unsigned integer identifying the equipment session or communication channel.  
- **Byte 2 (Stream & W-Bit)**:  
  - Bit 7: Wait Bit (\$W \= 1 \\implies \\text{Reply Expected}\$, \$W \= 0 \\implies \\text{No Reply}\$).  
  - Bits 0–6: SECS Stream (\$0 \\dots 127\$).  
- **Byte 3 (Function)**: SECS Function (\$0 \\dots 255\$). Odd functions indicate requests, even functions indicate responses.  
- **Byte 4 (PType)**: Presentation Type. Must be `0x00` for SECS-II encoding.  
- **Byte 5 (SType)**: Session Type:  
  - `0x00`: Data Message (Contains SECS-II Body).  
  - `0x01`: `Select.req` (Initiate equipment session).  
  - `0x02`: `Select.rsp` (Acknowledge session establishment).  
  - `0x03`: `Deselect.req` (Terminate session).  
  - `0x04`: `Deselect.rsp` (Acknowledge termination).  
  - `0x05`: `Linktest.req` (Heartbeat / link integrity test).  
  - `0x06`: `Linktest.rsp` (Heartbeat response).  
  - `0x07`: `Reject.req` (Malformed packet rejection).  
  - `0x09`: `Separate.req` (Immediate ungraceful disconnect).  
- **Bytes 6–9 (System Bytes)**: 32-bit transaction tracking number. Request and response pairs share identical System Bytes.

---

### 2.2 SEMI E5 SECS-II Item Encoding

Each SECS-II data item consists of a 1-, 2-, or 3-byte format header followed by the payload data:

\$\$\\text{Format Byte} \= (\\text{Format Code} \\ll 2\) \\mid \\text{Length Bytes Count}\$\$

| Format Code (Binary) | Type Symbol | Description | Valid Lengths |
| :---- | :---: | :---- | :---- |
| `000000` (`0x00`) | `L` | List of items | Number of child elements (\$0 \\dots N\$) |
| `001000` (`0x08`) | `B` | Binary raw bytes | \$0 \\dots 2^{24}-1\$ |
| `001001` (`0x09`) | `BOOLEAN` | Boolean (0=False, 1=True) | 1 byte per boolean |
| `010000` (`0x10`) | `A` | 7-Bit ASCII Character String | \$0 \\dots 2^{24}-1\$ bytes |
| `011000` (`0x18`) | `I2` | 2-Byte Signed Integer (Big Endian) | Multiples of 2 bytes |
| `011100` (`0x1C`) | `I4` | 4-Byte Signed Integer (Big Endian) | Multiples of 4 bytes |
| `100000` (`0x20`) | `I1` | 1-Byte Signed Integer | Multiples of 1 byte |
| `101000` (`0x28`) | `U2` | 2-Byte Unsigned Integer | Multiples of 2 bytes |
| `101100` (`0x2C`) | `U4` | 4-Byte Unsigned Integer | Multiples of 4 bytes |
| `110000` (`0x30`) | `U1` | 1-Byte Unsigned Integer | Multiples of 1 byte |
| `111000` (`0x38`) | `F4` | IEEE 754 Single-Precision Float | Multiples of 4 bytes |
| `111100` (`0x3C`) | `F8` | IEEE 754 Double-Precision Float | Multiples of 8 bytes |

---

## 3\. SEMI E30 GEM State Machine Architecture

                  \+---------------------------+

                  \|    EQUIPMENT\_OFFLINE      \|

                  \+---------------------------+

                                \|

                           \[REQ\_ONLINE\]

                                v

                  \+---------------------------+

                  \|      ATTEMPT\_ONLINE       \|

                  \+---------------------------+

                     /                     \\

        \[ONLINE\_ACCEPTED\]             \[ONLINE\_DENIED\]

                   v                         v

        \+--------------------+      \+--------------------+

        \|    ONLINE\_LOCAL    \|      \|    HOST\_OFFLINE    \|

        \+--------------------+      \+--------------------+

             \|          ^

  \[SWITCH\_REMOTE\]    \[SWITCH\_LOCAL\]

             v          \|

        \+--------------------+

        \|   ONLINE\_REMOTE    \|

        \+--------------------+

### State Definitions:

1. **EQUIPMENT\_OFFLINE**: Tool operates exclusively under manual operator panel control. Host cannot query or command tool.  
2. **ATTEMPT\_ONLINE**: Tool sends S1F1 or S1F17 to MES Host inquiring whether remote link can be accepted.  
3. **HOST\_OFFLINE**: Host is unreachable or rejected connection; tool holds local execution capability.  
4. **ONLINE\_LOCAL**: Tool communicates telemetry and event reports to Host, but Host cannot execute remote start/recipe switches.  
5. **ONLINE\_REMOTE**: Host possesses supervisory control to dispatch `START`, `STOP`, `PAUSE`, and `PP-SELECT` commands.

---

## 4\. SEMI E87 300mm FOUP Slot Map Validation Engine

In 300mm silicon wafer fabrication, carriers contain 25 vertical slots:

- State `0`: Undefined / Scan Sensor Failure.  
- State `1`: Empty Slot.  
- State `2`: Correctly Occupied (Wafer present and horizontal).  
- State `3`: **Double Slotted** (\$\\text{Hazard}\$: 2 wafers crammed into 1 slot).  
- State `4`: **Cross Slotted** (\$\\text{Hazard}\$: 1 wafer tilted across 2 adjacent slots).

Robotic transfer end-effectors are mechanically blocked if any slot exhibits State 3 or 4, preventing catastrophic multi-thousand-dollar wafer shattering.