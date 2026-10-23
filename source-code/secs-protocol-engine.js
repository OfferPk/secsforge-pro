/**
 * SECSForge Pro - Core Protocol Engine (SEMI E37 HSMS & SEMI E5 SECS-II)
 * Standard: SEMI E37 (HSMS-SS/GS) & SEMI E5 (SECS-II)
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SECSProtocolEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // SEMI E37 SType Definitions
  const S_TYPE = {
    DATA_MESSAGE: 0x00,
    SELECT_REQ: 0x01,
    SELECT_RSP: 0x02,
    DESELECT_REQ: 0x03,
    DESELECT_RSP: 0x04,
    LINKTEST_REQ: 0x05,
    LINKTEST_RSP: 0x06,
    REJECT_REQ: 0x07,
    SEPARATE_REQ: 0x09
  };

  const S_TYPE_NAMES = {
    0x00: 'Data Message (SECS-II)',
    0x01: 'Select.req',
    0x02: 'Select.rsp',
    0x03: 'Deselect.req',
    0x04: 'Deselect.rsp',
    0x05: 'Linktest.req',
    0x06: 'Linktest.rsp',
    0x07: 'Reject.req',
    0x09: 'Separate.req'
  };

  // SEMI E5 SECS-II Data Format Codes (6 bits, upper 6 bits of format byte)
  const FORMAT_CODES = {
    LIST: 0x00,     // 000000b
    BINARY: 0x08,   // 001000b
    BOOLEAN: 0x09,  // 001001b
    ASCII: 0x10,    // 010000b
    JIS8: 0x11,     // 010001b
    WCHAR: 0x12,    // 010010b
    I2: 0x18,       // 011000b - 2-byte Signed Integer
    I4: 0x1C,       // 011100b - 4-byte Signed Integer
    I1: 0x20,       // 100000b - 1-byte Signed Integer
    I8: 0x24,       // 100100b - 8-byte Signed Integer
    U2: 0x28,       // 101000b - 2-byte Unsigned Integer
    U4: 0x2C,       // 101100b - 4-byte Unsigned Integer
    U1: 0x30,       // 110000b - 1-byte Unsigned Integer
    U8: 0x34,       // 110100b - 8-byte Unsigned Integer
    F4: 0x38,       // 111000b - 4-byte IEEE 754 Float
    F8: 0x3C        // 111100b - 8-byte IEEE 754 Float
  };

  const FORMAT_NAMES = {
    0x00: 'L',
    0x08: 'B',
    0x09: 'BOOLEAN',
    0x10: 'A',
    0x18: 'I2',
    0x1C: 'I4',
    0x20: 'I1',
    0x28: 'U2',
    0x2C: 'U4',
    0x30: 'U1',
    0x38: 'F4',
    0x3C: 'F8'
  };

  class SECSProtocolEngine {
    constructor() {
      this.S_TYPE = S_TYPE;
      this.S_TYPE_NAMES = S_TYPE_NAMES;
      this.FORMAT_CODES = FORMAT_CODES;
      this.FORMAT_NAMES = FORMAT_NAMES;
    }

    /**
     * Builds a 10-byte SEMI E37 HSMS Header
     */
    buildHSMSHeader(options) {
      const {
        sessionId = 1,
        stream = 1,
        functionNum = 1,
        wBit = true,
        pType = 0x00,
        sType = S_TYPE.DATA_MESSAGE,
        systemBytes = Math.floor(Math.random() * 0xFFFFFFFF)
      } = options;

      const header = new Uint8Array(10);
      const view = new DataView(header.buffer);

      // Session ID (Bytes 0-1, 16-bit big endian)
      view.setUint16(0, sessionId & 0xFFFF, false);

      // Byte 2: Stream (bits 0-6) and W-bit (bit 7)
      const streamByte = (stream & 0x7F) | (wBit ? 0x80 : 0x00);
      header[2] = streamByte;

      // Byte 3: Function
      header[3] = functionNum & 0xFF;

      // Byte 4: Presentation Type (0 = SECS-II)
      header[4] = pType & 0xFF;

      // Byte 5: Session Type (SType)
      header[5] = sType & 0xFF;

      // Bytes 6-9: System Bytes (Transaction ID, 32-bit big endian)
      view.setUint32(6, systemBytes >>> 0, false);

      return header;
    }

    /**
     * Dissects an HSMS Header
     */
    parseHSMSHeader(headerBytes) {
      if (!headerBytes || headerBytes.length < 10) {
        throw new Error('Invalid HSMS header length: expected 10 bytes');
      }
      const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, 10);
      const sessionId = view.getUint16(0, false);
      const streamByte = headerBytes[2];
      const wBit = (streamByte & 0x80) !== 0;
      const stream = streamByte & 0x7F;
      const functionNum = headerBytes[3];
      const pType = headerBytes[4];
      const sType = headerBytes[5];
      const systemBytes = view.getUint32(6, false);

      return {
        sessionId,
        stream,
        functionNum,
        wBit,
        pType,
        sType,
        sTypeName: S_TYPE_NAMES[sType] || `Unknown (0x${sType.toString(16)})`,
        systemBytes,
        isControlMessage: sType !== S_TYPE.DATA_MESSAGE
      };
    }

    /**
     * Wraps header and body into complete 4-byte length-prefixed HSMS packet
     */
    wrapHSMSPacket(headerBytes, bodyBytes = new Uint8Array(0)) {
      const totalMsgLen = 10 + bodyBytes.length;
      const packet = new Uint8Array(4 + totalMsgLen);
      const view = new DataView(packet.buffer);

      // 4-byte big-endian message length
      view.setUint32(0, totalMsgLen, false);
      packet.set(headerBytes, 4);
      if (bodyBytes.length > 0) {
        packet.set(bodyBytes, 14);
      }
      return packet;
    }

    /**
     * Parses a complete HSMS wire packet (length + header + body)
     */
    parseHSMSPacket(packetBytes) {
      if (packetBytes.length < 14) {
        throw new Error('HSMS packet too short: minimum length is 14 bytes');
      }
      const view = new DataView(packetBytes.buffer, packetBytes.byteOffset, packetBytes.length);
      const messageLength = view.getUint32(0, false);

      if (packetBytes.length < 4 + messageLength) {
        throw new Error(`Incomplete packet: expected ${4 + messageLength} bytes, got ${packetBytes.length}`);
      }

      const headerBytes = packetBytes.subarray(4, 14);
      const bodyBytes = packetBytes.subarray(14, 4 + messageLength);
      const header = this.parseHSMSHeader(headerBytes);

      let secsItems = null;
      if (header.sType === S_TYPE.DATA_MESSAGE && bodyBytes.length > 0) {
        try {
          secsItems = this.decodeSECSItem(bodyBytes, 0).item;
        } catch (err) {
          secsItems = { error: `Failed to decode SECS-II body: ${err.message}` };
        }
      }

      return {
        messageLength,
        header,
        bodyBytes,
        secsItems
      };
    }

    /**
     * Encodes a SECS-II item into binary bytes
     */
    encodeSECSItem(item) {
      if (!item) return new Uint8Array(0);

      const type = (item.type || '').toUpperCase();
      let formatCode = FORMAT_CODES[type];
      if (formatCode === undefined) {
        if (type === 'BOOLEAN') formatCode = FORMAT_CODES.BOOLEAN;
        else if (type === 'L' || type === 'LIST') formatCode = FORMAT_CODES.LIST;
        else if (type === 'A' || type === 'ASCII') formatCode = FORMAT_CODES.ASCII;
        else if (type === 'B' || type === 'BINARY') formatCode = FORMAT_CODES.BINARY;
        else throw new Error(`Unknown SECS-II item type: ${item.type}`);
      }

      // Handle List
      if (formatCode === FORMAT_CODES.LIST) {
        const elements = Array.isArray(item.value) ? item.value : [];
        const count = elements.length;
        const encodedChildren = [];
        let totalChildBytes = 0;

        for (const child of elements) {
          const encodedChild = this.encodeSECSItem(child);
          encodedChildren.push(encodedChild);
          totalChildBytes += encodedChild.length;
        }

        const lenBytesCount = count <= 255 ? 1 : (count <= 65535 ? 2 : 3);
        const formatByte = (formatCode << 2) | lenBytesCount;
        const header = new Uint8Array(1 + lenBytesCount);
        header[0] = formatByte;

        if (lenBytesCount === 1) {
          header[1] = count & 0xFF;
        } else if (lenBytesCount === 2) {
          header[1] = (count >> 8) & 0xFF;
          header[2] = count & 0xFF;
        } else {
          header[1] = (count >> 16) & 0xFF;
          header[2] = (count >> 8) & 0xFF;
          header[3] = count & 0xFF;
        }

        const res = new Uint8Array(header.length + totalChildBytes);
        res.set(header, 0);
        let offset = header.length;
        for (const childBytes of encodedChildren) {
          res.set(childBytes, offset);
          offset += childBytes.length;
        }
        return res;
      }

      // Handle Non-List primitives
      let payload;
      if (formatCode === FORMAT_CODES.ASCII) {
        const str = String(item.value || '');
        payload = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
          payload[i] = str.charCodeAt(i) & 0x7F; // 7-bit ASCII
        }
      } else if (formatCode === FORMAT_CODES.BINARY) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length);
        for (let i = 0; i < vals.length; i++) payload[i] = Number(vals[i]) & 0xFF;
      } else if (formatCode === FORMAT_CODES.BOOLEAN) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length);
        for (let i = 0; i < vals.length; i++) payload[i] = vals[i] ? 1 : 0;
      } else if (formatCode === FORMAT_CODES.U1) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length);
        for (let i = 0; i < vals.length; i++) payload[i] = Number(vals[i]) & 0xFF;
      } else if (formatCode === FORMAT_CODES.I1) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length);
        const view = new DataView(payload.buffer);
        for (let i = 0; i < vals.length; i++) view.setInt8(i, Number(vals[i]));
      } else if (formatCode === FORMAT_CODES.U2) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length * 2);
        const view = new DataView(payload.buffer);
        for (let i = 0; i < vals.length; i++) view.setUint16(i * 2, Number(vals[i]), false);
      } else if (formatCode === FORMAT_CODES.I2) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length * 2);
        const view = new DataView(payload.buffer);
        for (let i = 0; i < vals.length; i++) view.setInt16(i * 2, Number(vals[i]), false);
      } else if (formatCode === FORMAT_CODES.U4) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length * 4);
        const view = new DataView(payload.buffer);
        for (let i = 0; i < vals.length; i++) view.setUint32(i * 4, Number(vals[i]), false);
      } else if (formatCode === FORMAT_CODES.I4) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length * 4);
        const view = new DataView(payload.buffer);
        for (let i = 0; i < vals.length; i++) view.setInt32(i * 4, Number(vals[i]), false);
      } else if (formatCode === FORMAT_CODES.F4) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length * 4);
        const view = new DataView(payload.buffer);
        for (let i = 0; i < vals.length; i++) view.setFloat32(i * 4, Number(vals[i]), false);
      } else if (formatCode === FORMAT_CODES.F8) {
        let vals = Array.isArray(item.value) ? item.value : [item.value];
        payload = new Uint8Array(vals.length * 8);
        const view = new DataView(payload.buffer);
        for (let i = 0; i < vals.length; i++) view.setFloat64(i * 8, Number(vals[i]), false);
      } else {
        throw new Error(`Unsupported format code: 0x${formatCode.toString(16)}`);
      }

      const byteLen = payload.length;
      const lenBytesCount = byteLen <= 255 ? 1 : (byteLen <= 65535 ? 2 : 3);
      const formatByte = (formatCode << 2) | lenBytesCount;
      const header = new Uint8Array(1 + lenBytesCount);
      header[0] = formatByte;

      if (lenBytesCount === 1) {
        header[1] = byteLen & 0xFF;
      } else if (lenBytesCount === 2) {
        header[1] = (byteLen >> 8) & 0xFF;
        header[2] = byteLen & 0xFF;
      } else {
        header[1] = (byteLen >> 16) & 0xFF;
        header[2] = (byteLen >> 8) & 0xFF;
        header[3] = byteLen & 0xFF;
      }

      const res = new Uint8Array(header.length + payload.length);
      res.set(header, 0);
      res.set(payload, header.length);
      return res;
    }

    /**
     * Decodes a SECS-II item from binary buffer
     */
    decodeSECSItem(buffer, offset = 0) {
      if (offset >= buffer.length) {
        throw new Error('Offset beyond buffer length');
      }

      const formatByte = buffer[offset];
      const formatCode = (formatByte >> 2) & 0x3F;
      const lenBytesCount = formatByte & 0x03;

      if (lenBytesCount < 1 || lenBytesCount > 3) {
        throw new Error(`Invalid length bytes count: ${lenBytesCount}`);
      }

      let length = 0;
      for (let i = 0; i < lenBytesCount; i++) {
        length = (length << 8) | buffer[offset + 1 + i];
      }

      let currentOffset = offset + 1 + lenBytesCount;
      const typeName = FORMAT_NAMES[formatCode] || `Unknown(0x${formatCode.toString(16)})`;

      if (formatCode === FORMAT_CODES.LIST) {
        const children = [];
        for (let i = 0; i < length; i++) {
          const childResult = this.decodeSECSItem(buffer, currentOffset);
          children.push(childResult.item);
          currentOffset = childResult.nextOffset;
        }
        return {
          item: {
            type: 'L',
            length,
            value: children
          },
          nextOffset: currentOffset
        };
      }

      // Primitive decoding
      const slice = buffer.subarray(currentOffset, currentOffset + length);
      currentOffset += length;
      const view = new DataView(slice.buffer, slice.byteOffset, slice.length);
      let value;

      switch (formatCode) {
        case FORMAT_CODES.ASCII: {
          let s = '';
          for (let i = 0; i < slice.length; i++) {
            s += String.fromCharCode(slice[i]);
          }
          value = s;
          break;
        }
        case FORMAT_CODES.BINARY: {
          value = Array.from(slice);
          break;
        }
        case FORMAT_CODES.BOOLEAN: {
          value = Array.from(slice).map(b => b !== 0);
          if (value.length === 1) value = value[0];
          break;
        }
        case FORMAT_CODES.U1: {
          value = Array.from(slice);
          if (value.length === 1) value = value[0];
          break;
        }
        case FORMAT_CODES.I1: {
          const vals = [];
          for (let i = 0; i < slice.length; i++) vals.push(view.getInt8(i));
          value = vals.length === 1 ? vals[0] : vals;
          break;
        }
        case FORMAT_CODES.U2: {
          const vals = [];
          for (let i = 0; i < slice.length; i += 2) vals.push(view.getUint16(i, false));
          value = vals.length === 1 ? vals[0] : vals;
          break;
        }
        case FORMAT_CODES.I2: {
          const vals = [];
          for (let i = 0; i < slice.length; i += 2) vals.push(view.getInt16(i, false));
          value = vals.length === 1 ? vals[0] : vals;
          break;
        }
        case FORMAT_CODES.U4: {
          const vals = [];
          for (let i = 0; i < slice.length; i += 4) vals.push(view.getUint32(i, false));
          value = vals.length === 1 ? vals[0] : vals;
          break;
        }
        case FORMAT_CODES.I4: {
          const vals = [];
          for (let i = 0; i < slice.length; i += 4) vals.push(view.getInt32(i, false));
          value = vals.length === 1 ? vals[0] : vals;
          break;
        }
        case FORMAT_CODES.F4: {
          const vals = [];
          for (let i = 0; i < slice.length; i += 4) vals.push(Number(view.getFloat32(i, false).toFixed(4)));
          value = vals.length === 1 ? vals[0] : vals;
          break;
        }
        case FORMAT_CODES.F8: {
          const vals = [];
          for (let i = 0; i < slice.length; i += 8) vals.push(Number(view.getFloat64(i, false).toFixed(6)));
          value = vals.length === 1 ? vals[0] : vals;
          break;
        }
        default:
          value = Array.from(slice);
      }

      return {
        item: {
          type: typeName,
          length,
          value
        },
        nextOffset: currentOffset
      };
    }

    /**
     * Converts a SECS-II item into clean SML text notation
     */
    itemToSML(item, indent = 0) {
      if (!item) return '';
      const pad = '  '.repeat(indent);
      const type = (item.type || '').toUpperCase();

      if (type === 'L') {
        const list = Array.isArray(item.value) ? item.value : [];
        if (list.length === 0) {
          return `${pad}<L [0]>`;
        }
        let out = `${pad}<L [${list.length}]\n`;
        for (let i = 0; i < list.length; i++) {
          out += this.itemToSML(list[i], indent + 1);
          if (i < list.length - 1) out += '\n';
        }
        out += `\n${pad}>`;
        return out;
      }

      if (type === 'A') {
        const val = String(item.value !== undefined ? item.value : '');
        return `${pad}<A [${val.length}] "${val}">`;
      }

      if (type === 'B') {
        const vals = Array.isArray(item.value) ? item.value : [item.value];
        const hexStr = vals.map(v => '0x' + (Number(v) & 0xFF).toString(16).padStart(2, '0')).join(' ');
        return `${pad}<B [${vals.length}] ${hexStr}>`;
      }

      const vals = Array.isArray(item.value) ? item.value : [item.value];
      return `${pad}<${type} [${vals.length}] ${vals.join(' ')}>`;
    }

    /**
     * Parses SML (SECS Message Language) text into SECS-II item AST
     */
    parseSML(smlText) {
      if (!smlText || typeof smlText !== 'string') {
        throw new Error('SML text must be a valid non-empty string');
      }

      // Extract SxFy header line if present
      let stream = 1;
      let func = 1;
      let wBit = false;

      const headerMatch = smlText.match(/S(\d+)F(\d+)(\s+W)?/i);
      if (headerMatch) {
        stream = parseInt(headerMatch[1], 10);
        func = parseInt(headerMatch[2], 10);
        wBit = !!headerMatch[3];
      }

      // Tokenize items inside angle brackets: <Type [len] value>
      // Strip out comments and SxFy header
      const cleaned = smlText.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();

      // Find root item opening
      const rootStart = cleaned.indexOf('<');
      if (rootStart === -1) {
        return {
          stream,
          func,
          wBit,
          item: null
        };
      }

      const parseNode = (text, index) => {
        let i = text.indexOf('<', index);
        if (i === -1) return { node: null, nextIndex: text.length };

        // Match tag: <TYPE [LEN] ...
        const tagMatch = text.slice(i).match(/^<([A-Za-z0-9_]+)(?:\s*\[(\d+)\])?/);
        if (!tagMatch) {
          throw new Error(`Syntax error at index ${i}: invalid tag opening`);
        }

        const type = tagMatch[1].toUpperCase();
        let cursor = i + tagMatch[0].length;

        if (type === 'L') {
          const children = [];
          while (cursor < text.length) {
            // Find next '<' or '>'
            const nextOpen = text.indexOf('<', cursor);
            const nextClose = text.indexOf('>', cursor);

            if (nextClose !== -1 && (nextOpen === -1 || nextClose < nextOpen)) {
              // End of list
              cursor = nextClose + 1;
              break;
            } else if (nextOpen !== -1) {
              const child = parseNode(text, nextOpen);
              if (child.node) children.push(child.node);
              cursor = child.nextIndex;
            } else {
              break;
            }
          }
          return {
            node: { type: 'L', length: children.length, value: children },
            nextIndex: cursor
          };
        } else {
          // Primitive item up to '>'
          const closeIndex = text.indexOf('>', cursor);
          if (closeIndex === -1) throw new Error(`Unclosed tag <${type} at index ${i}`);
          const content = text.slice(cursor, closeIndex).trim();
          cursor = closeIndex + 1;

          let value;
          if (type === 'A') {
            const strMatch = content.match(/"([^"]*)"/);
            value = strMatch ? strMatch[1] : content;
          } else if (type === 'B') {
            value = content.split(/\s+/).filter(Boolean).map(h => parseInt(h, 16));
          } else if (type === 'BOOLEAN') {
            value = content.split(/\s+/).filter(Boolean).map(b => b.toLowerCase() === 'true' || b === '1');
            if (value.length === 1) value = value[0];
          } else if (['U1', 'U2', 'U4', 'I1', 'I2', 'I4'].includes(type)) {
            value = content.split(/\s+/).filter(Boolean).map(n => parseInt(n, 10));
            if (value.length === 1) value = value[0];
          } else if (['F4', 'F8'].includes(type)) {
            value = content.split(/\s+/).filter(Boolean).map(n => parseFloat(n));
            if (value.length === 1) value = value[0];
          } else {
            value = content;
          }

          return {
            node: { type, value },
            nextIndex: cursor
          };
        }
      };

      const result = parseNode(cleaned, rootStart);
      return {
        stream,
        func,
        wBit,
        item: result.node
      };
    }

    /**
     * Standard SEMI SxFy Message Library Factory
     */
    createStandardMessage(templateName, params = {}) {
      switch (templateName) {
        case 'S1F1_ARE_YOU_THERE':
          return {
            stream: 1,
            func: 1,
            wBit: true,
            headerDesc: 'Are You There Request',
            item: null
          };

        case 'S1F2_ON_LINE_DATA':
          return {
            stream: 1,
            func: 2,
            wBit: false,
            headerDesc: 'On Line Data Response',
            item: {
              type: 'L',
              value: [
                { type: 'A', value: params.mdln || 'SECS_ETCH_300' },
                { type: 'A', value: params.softrev || 'v4.12.0' }
              ]
            }
          };

        case 'S1F13_ESTABLISH_COMM':
          return {
            stream: 1,
            func: 13,
            wBit: true,
            headerDesc: 'Establish Communications Request',
            item: {
              type: 'L',
              value: [
                { type: 'A', value: params.mdln || 'APPLIED_CENTURA' },
                { type: 'A', value: params.softrev || 'v2.8.4' }
              ]
            }
          };

        case 'S1F14_ESTABLISH_COMM_ACK':
          return {
            stream: 1,
            func: 14,
            wBit: false,
            headerDesc: 'Establish Communications Ack',
            item: {
              type: 'L',
              value: [
                { type: 'B', value: [params.commack !== undefined ? params.commack : 0x00] }, // 0=Ack, 1=Denied
                {
                  type: 'L',
                  value: [
                    { type: 'A', value: params.mdln || 'FAB_HOST_MES' },
                    { type: 'A', value: params.softrev || 'v9.3.1' }
                  ]
                }
              ]
            }
          };

        case 'S2F41_HOST_COMMAND':
          return {
            stream: 2,
            func: 41,
            wBit: true,
            headerDesc: 'Host Command Send (RCMD)',
            item: {
              type: 'L',
              value: [
                { type: 'A', value: params.rcmd || 'START' }, // START, STOP, PAUSE, RESUME, PP-SELECT
                {
                  type: 'L',
                  value: [
                    {
                      type: 'L',
                      value: [
                        { type: 'A', value: 'PPID' },
                        { type: 'A', value: params.ppid || 'POLY_GATE_ETCH_V2' }
                      ]
                    },
                    {
                      type: 'L',
                      value: [
                        { type: 'A', value: 'LOT_ID' },
                        { type: 'A', value: params.lotId || 'LOT_WFR_8849' }
                      ]
                    }
                  ]
                }
              ]
            }
          };

        case 'S2F42_HOST_COMMAND_ACK':
          return {
            stream: 2,
            func: 42,
            wBit: false,
            headerDesc: 'Host Command Ack (HCACK)',
            item: {
              type: 'L',
              value: [
                { type: 'B', value: [params.hcack !== undefined ? params.hcack : 0x00] }, // 0=Acknowledge
                { type: 'L', value: [] } // Parameter errors list
              ]
            }
          };

        case 'S5F1_ALARM_REPORT':
          return {
            stream: 5,
            func: 1,
            wBit: true,
            headerDesc: 'Alarm Report Send',
            item: {
              type: 'L',
              value: [
                { type: 'B', value: [params.alcd || 0x81] }, // Bit 7: 1=Set, 0=Cleared. Code: 1=Personal safety
                { type: 'U4', value: params.alid || 10402 },
                { type: 'A', value: params.altx || 'CHAMBER_1_CHUCK_OVERTEMP' }
              ]
            }
          };

        case 'S6F11_EVENT_REPORT':
          return {
            stream: 6,
            func: 11,
            wBit: true,
            headerDesc: 'Event Report Send (CEID)',
            item: {
              type: 'L',
              value: [
                { type: 'U4', value: params.dataid || 1 },
                { type: 'U4', value: params.ceid || 501 }, // Collection Event ID (e.g. 501: Wafer Process Finished)
                {
                  type: 'L',
                  value: [
                    {
                      type: 'L',
                      value: [
                        { type: 'U4', value: 1001 }, // Report ID
                        {
                          type: 'L',
                          value: [
                            { type: 'A', value: params.waferId || 'W01_SLOT_07' },
                            { type: 'F4', value: params.temperature || 350.5 },
                            { type: 'U4', value: params.rfPower || 1200 }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          };

        case 'S7F3_PROCESS_PROGRAM_SEND':
          return {
            stream: 7,
            func: 3,
            wBit: true,
            headerDesc: 'Process Program (Recipe) Send',
            item: {
              type: 'L',
              value: [
                { type: 'A', value: params.ppid || 'RECIPE_NITRIDE_DEP_30NM' },
                { type: 'B', value: params.ppbody || [0x50, 0x50, 0x01, 0x1A, 0x04, 0x00, 0x22, 0x3F] }
              ]
            }
          };

        default:
          throw new Error(`Unknown standard message template: ${templateName}`);
      }
    }

    /**
     * Generates a Wireshark-compatible Libpcap 2.4 capture file
     */
    generatePCAP(packets) {
      // 24-byte Libpcap Global Header
      const globalHeader = new Uint8Array(24);
      const ghView = new DataView(globalHeader.buffer);
      ghView.setUint32(0, 0xa1b2c3d4, false); // Magic Number (Big-endian)
      ghView.setUint16(4, 2, false);          // Major version 2
      ghView.setUint16(6, 4, false);          // Minor version 4
      ghView.setInt32(8, 0, false);           // Timezone offset GMT
      ghView.setUint32(12, 0, false);         // Sigfigs
      ghView.setUint32(16, 65535, false);     // Snaplen
      ghView.setUint32(20, 1, false);         // Link-layer header type (1 = Ethernet)

      const packetBuffers = [];
      let totalLength = 24;

      const baseSec = Math.floor(Date.now() / 1000) - 30;
      let microSec = 100000;

      for (let idx = 0; idx < packets.length; idx++) {
        const hsmsPayload = packets[idx];
        const ethLen = 14;
        const ipLen = 20;
        const tcpLen = 20;
        const frameLen = ethLen + ipLen + tcpLen + hsmsPayload.length;

        const frame = new Uint8Array(frameLen);
        const fView = new DataView(frame.buffer);

        // Ethernet (14 bytes)
        // Dst MAC: 00:1A:2B:3C:4D:5E (Fab Host MES)
        frame.set([0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e], 0);
        // Src MAC: 00:50:C2:AA:BB:CC (Semiconductor Tool)
        frame.set([0x00, 0x50, 0xc2, 0xaa, 0xbb, 0xcc], 6);
        // EtherType: IPv4 (0x0800)
        fView.setUint16(12, 0x0800, false);

        // IPv4 (20 bytes)
        frame[14] = 0x45; // Version 4, IHL 5
        frame[15] = 0x00; // DSCP / ECN
        fView.setUint16(16, ipLen + tcpLen + hsmsPayload.length, false);
        fView.setUint16(18, 0x5000 + idx, false); // Identification
        fView.setUint16(20, 0x4000, false); // Don't Fragment
        frame[22] = 64;   // TTL
        frame[23] = 6;    // Protocol = TCP
        fView.setUint16(24, 0x0000, false); // Checksum placeholder
        // Src IP: 10.100.4.15 (Wafer Tool)
        frame.set([10, 100, 4, 15], 26);
        // Dst IP: 10.100.1.1 (MES Host)
        frame.set([10, 100, 1, 1], 30);

        // TCP (20 bytes)
        fView.setUint16(34, 54321, false); // Src Port
        fView.setUint16(36, 5000, false);  // Dst Port = 5000 (Standard HSMS port)
        fView.setUint32(38, 1000000 + (idx * 500), false); // Seq Num
        fView.setUint32(42, 2000000 + (idx * 500), false); // Ack Num
        frame[46] = 0x50; // Data offset 5 words (20 bytes)
        frame[47] = 0x18; // Flags: ACK, PSH
        fView.setUint16(48, 64240, false); // Window Size
        fView.setUint16(50, 0x0000, false); // Checksum
        fView.setUint16(52, 0x0000, false); // Urgent Pointer

        // Append HSMS payload
        frame.set(hsmsPayload, 54);

        // Packet Header (16 bytes)
        const pHeader = new Uint8Array(16);
        const phView = new DataView(pHeader.buffer);
        phView.setUint32(0, baseSec + idx, false);
        phView.setUint32(4, microSec, false);
        phView.setUint32(8, frameLen, false);  // Included length
        phView.setUint32(12, frameLen, false); // Original length

        packetBuffers.push(pHeader, frame);
        totalLength += 16 + frameLen;
        microSec += 150000;
      }

      const pcap = new Uint8Array(totalLength);
      pcap.set(globalHeader, 0);
      let offset = 24;
      for (const buf of packetBuffers) {
        pcap.set(buf, offset);
        offset += buf.length;
      }
      return pcap;
    }
  }

  return SECSProtocolEngine;
});
