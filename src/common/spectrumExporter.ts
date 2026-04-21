/**
 * Serialise a spectrum back to the RadiaCode XML import format.
 *
 * Inverse of `parseSpectrumXml` in `./spectrumParser.ts`. The produced XML
 * re-imports bit-identically through that parser and is accepted by the
 * original RadiaCode app.
 */

export interface ExportableSpectrum {
  sampleName: string;
  deviceName: string;
  measurementTime: number;
  liveTime: number;
  startTime: string;
  endTime: string;
  coefficients: number[];
  counts: number[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportSpectrumXml(s: ExportableSpectrum): string {
  const coefficientsXml = s.coefficients
    .map((c) => `        <Coefficient>${c}</Coefficient>`)
    .join('\n');
  const dataPointsXml = s.counts
    .map((n) => `      <DataPoint>${n}</DataPoint>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ResultDataFile>
  <ResultData>
    <DeviceConfigReference>
      <Name>${escapeXml(s.deviceName)}</Name>
    </DeviceConfigReference>
    <SampleInfo>
      <Name>${escapeXml(s.sampleName)}</Name>
    </SampleInfo>
    <StartTime>${escapeXml(s.startTime)}</StartTime>
    <EndTime>${escapeXml(s.endTime)}</EndTime>
    <EnergySpectrum>
      <NumberOfChannels>${s.counts.length}</NumberOfChannels>
      <MeasurementTime>${s.measurementTime}</MeasurementTime>
      <LiveTime>${s.liveTime}</LiveTime>
      <EnergyCalibration>
        <Coefficients>
${coefficientsXml}
        </Coefficients>
      </EnergyCalibration>
      <Spectrum>
${dataPointsXml}
      </Spectrum>
    </EnergySpectrum>
  </ResultData>
</ResultDataFile>
`;
}
