declare module 'dicom-parser' {
  export interface ByteArrayFragment {
    offset: number
    position: number
    length: number
  }

  export interface DataElement {
    tag: string
    vr?: string
    length: number
    dataOffset: number
    hadUndefinedLength?: boolean
    encapsulatedPixelData?: boolean
    basicOffsetTable?: number[]
    fragments?: ByteArrayFragment[]
    items?: DataElement[]
  }

  export interface DataSet {
    byteArray: Uint8Array
    elements: Record<string, DataElement>
    uint16: (tag: string, index?: number) => number | undefined
    int16: (tag: string, index?: number) => number | undefined
    uint32: (tag: string, index?: number) => number | undefined
    int32: (tag: string, index?: number) => number | undefined
    float: (tag: string, index?: number) => number | undefined
    double: (tag: string, index?: number) => number | undefined
    string: (tag: string, index?: number) => string | undefined
    floatString: (tag: string, index?: number) => number | undefined
    intString: (tag: string, index?: number) => number | undefined
  }

  export function parseDicom(
    byteArray: Uint8Array,
    options?: { TransferSyntaxUID?: string },
  ): DataSet
}
