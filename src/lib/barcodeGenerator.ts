/**
 * Code 128 Barcode Generator
 * Generates SVG paths for Code 128B barcodes
 */

// Code 128B character set encoding patterns
const CODE128B_PATTERNS: Record<string, string> = {
  ' ': '11011001100', '!': '11001101100', '"': '11001100110', '#': '10010011000',
  '$': '10010001100', '%': '10001001100', '&': '10011001000', "'": '10011000100',
  '(': '10001100100', ')': '11001001000', '*': '11001000100', '+': '11000100100',
  ',': '10110011100', '-': '10011011100', '.': '10011001110', '/': '10111001100',
  '0': '10011101100', '1': '10011100110', '2': '11001110010', '3': '11001011100',
  '4': '11001001110', '5': '11011100100', '6': '11001110100', '7': '11101101110',
  '8': '11101001100', '9': '11100101100', ':': '11100100110', ';': '11101100100',
  '<': '11100110100', '=': '11100110010', '>': '11011011000', '?': '11011000110',
  '@': '11000110110', 'A': '10100011000', 'B': '10001011000', 'C': '10001000110',
  'D': '10110001000', 'E': '10001101000', 'F': '10001100010', 'G': '11010001000',
  'H': '11000101000', 'I': '11000100010', 'J': '10110111000', 'K': '10110001110',
  'L': '10001101110', 'M': '10111011000', 'N': '10111000110', 'O': '10001110110',
  'P': '11101110110', 'Q': '11010001110', 'R': '11000101110', 'S': '11011101000',
  'T': '11011100010', 'U': '11011101110', 'V': '11101011000', 'W': '11101000110',
  'X': '11100010110', 'Y': '11101101000', 'Z': '11101100010', '[': '11100011010',
  '\\': '11101111010', ']': '11001000010', '^': '11110001010', '_': '10100110000',
  '`': '10100001100', 'a': '10010110000', 'b': '10010000110', 'c': '10000101100',
  'd': '10000100110', 'e': '10110010000', 'f': '10110000100', 'g': '10011010000',
  'h': '10011000010', 'i': '10000110100', 'j': '10000110010', 'k': '11000010010',
  'l': '11001010000', 'm': '11110111010', 'n': '11000010100', 'o': '10001111010',
  'p': '10100111100', 'q': '10010111100', 'r': '10010011110', 's': '10111100100',
  't': '10011110100', 'u': '10011110010', 'v': '11110100100', 'w': '11110010100',
  'x': '11110010010', 'y': '11011011110', 'z': '11011110110', '{': '11110110110',
  '|': '10101111000', '}': '10100011110', '~': '10001011110',
};

// Character value lookup for checksum calculation
const CODE128B_VALUES: Record<string, number> = {
  ' ': 0, '!': 1, '"': 2, '#': 3, '$': 4, '%': 5, '&': 6, "'": 7,
  '(': 8, ')': 9, '*': 10, '+': 11, ',': 12, '-': 13, '.': 14, '/': 15,
  '0': 16, '1': 17, '2': 18, '3': 19, '4': 20, '5': 21, '6': 22, '7': 23,
  '8': 24, '9': 25, ':': 26, ';': 27, '<': 28, '=': 29, '>': 30, '?': 31,
  '@': 32, 'A': 33, 'B': 34, 'C': 35, 'D': 36, 'E': 37, 'F': 38, 'G': 39,
  'H': 40, 'I': 41, 'J': 42, 'K': 43, 'L': 44, 'M': 45, 'N': 46, 'O': 47,
  'P': 48, 'Q': 49, 'R': 50, 'S': 51, 'T': 52, 'U': 53, 'V': 54, 'W': 55,
  'X': 56, 'Y': 57, 'Z': 58, '[': 59, '\\': 60, ']': 61, '^': 62, '_': 63,
  '`': 64, 'a': 65, 'b': 66, 'c': 67, 'd': 68, 'e': 69, 'f': 70, 'g': 71,
  'h': 72, 'i': 73, 'j': 74, 'k': 75, 'l': 76, 'm': 77, 'n': 78, 'o': 79,
  'p': 80, 'q': 81, 'r': 82, 's': 83, 't': 84, 'u': 85, 'v': 86, 'w': 87,
  'x': 88, 'y': 89, 'z': 90, '{': 91, '|': 92, '}': 93, '~': 94,
};

// Special patterns
const START_B = '11010010000'; // Start Code B (value 104)
const STOP = '1100011101011'; // Stop pattern

// Checksum value patterns (for values 95-106)
const CHECKSUM_PATTERNS: Record<number, string> = {
  95: '11110101000', 96: '11110100010', 97: '10111101110', 98: '10111100010',
  99: '11110101110', 100: '11110100100', 101: '10010111000', 102: '10000100111',
  103: '10010110111', 104: '11010010000', 105: '11010000100', 106: '11010011100',
};

/**
 * Generate the binary pattern for a Code 128B barcode
 */
export function generateCode128Pattern(text: string): string {
  if (!text) return '';

  // Start with Start B code
  let pattern = START_B;
  let checksum = 104; // Start B value

  // Encode each character
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charPattern = CODE128B_PATTERNS[char];
    const charValue = CODE128B_VALUES[char];

    if (charPattern === undefined || charValue === undefined) {
      // Skip unsupported characters or use space
      pattern += CODE128B_PATTERNS[' '];
      checksum += 0 * (i + 1);
    } else {
      pattern += charPattern;
      checksum += charValue * (i + 1);
    }
  }

  // Calculate checksum
  const checksumValue = checksum % 103;
  
  // Add checksum pattern
  if (checksumValue <= 94) {
    // Find character with this value
    const checksumChar = Object.entries(CODE128B_VALUES).find(([, v]) => v === checksumValue);
    if (checksumChar) {
      pattern += CODE128B_PATTERNS[checksumChar[0]];
    }
  } else {
    pattern += CHECKSUM_PATTERNS[checksumValue] || '';
  }

  // Add stop pattern
  pattern += STOP;

  return pattern;
}

/**
 * Generate SVG barcode element as a string
 */
export function generateBarcodeSVG(
  text: string,
  options: {
    width?: number;
    height?: number;
    barColor?: string;
    backgroundColor?: string;
    showText?: boolean;
    fontSize?: number;
  } = {}
): string {
  const {
    width = 200,
    height = 60,
    barColor = '#000000',
    backgroundColor = '#FFFFFF',
    showText = true,
    fontSize = 12,
  } = options;

  const pattern = generateCode128Pattern(text);
  if (!pattern) return '';

  const barWidth = width / pattern.length;
  const barcodeHeight = showText ? height - fontSize - 4 : height;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="${backgroundColor}"/>`;

  // Draw bars
  let x = 0;
  for (const bit of pattern) {
    if (bit === '1') {
      svg += `<rect x="${x}" y="0" width="${barWidth}" height="${barcodeHeight}" fill="${barColor}"/>`;
    }
    x += barWidth;
  }

  // Add text below barcode
  if (showText) {
    svg += `<text x="${width / 2}" y="${height - 2}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" fill="${barColor}">${text}</text>`;
  }

  svg += '</svg>';

  return svg;
}

/**
 * Generate a data URL for the barcode SVG
 */
export function generateBarcodeDataURL(text: string, options?: Parameters<typeof generateBarcodeSVG>[1]): string {
  const svg = generateBarcodeSVG(text, options);
  if (!svg) return '';
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
