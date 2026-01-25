/**
 * DOMMatrix polyfill for Node.js environment.
 * Required by pdfjs-dist in server-side usage.
 */

type DOMMatrixInit = {
  a?: number
  b?: number
  c?: number
  d?: number
  e?: number
  f?: number
  m11?: number
  m12?: number
  m13?: number
  m14?: number
  m21?: number
  m22?: number
  m23?: number
  m24?: number
  m31?: number
  m32?: number
  m33?: number
  m34?: number
  m41?: number
  m42?: number
  m43?: number
  m44?: number
  is2D?: boolean
}

class DOMMatrixPolyfill {
  // 2D components
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0

  // 4x4 matrix components
  m11 = 1
  m12 = 0
  m13 = 0
  m14 = 0
  m21 = 0
  m22 = 1
  m23 = 0
  m24 = 0
  m31 = 0
  m32 = 0
  m33 = 1
  m34 = 0
  m41 = 0
  m42 = 0
  m43 = 0
  m44 = 1

  is2D = true
  isIdentity = true

  constructor(init?: string | number[] | DOMMatrixInit) {
    if (init) {
      if (typeof init === 'string') {
        this.parseTransformString(init)
      } else if (Array.isArray(init)) {
        this.setFromArray(init)
      } else {
        this.setFromInit(init)
      }
    }
    this.sync2DTo4x4()
  }

  private parseTransformString(str: string) {
    const match = str.match(/matrix\(([^)]+)\)/)
    if (match) {
      const values = match[1].split(/[\s,]+/).map(Number)
      if (values.length >= 6) {
        ;[this.a, this.b, this.c, this.d, this.e, this.f] = values
      }
    }
  }

  private setFromArray(arr: number[]) {
    if (arr.length === 6) {
      ;[this.a, this.b, this.c, this.d, this.e, this.f] = arr
      this.is2D = true
    } else if (arr.length === 16) {
      ;[
        this.m11,
        this.m12,
        this.m13,
        this.m14,
        this.m21,
        this.m22,
        this.m23,
        this.m24,
        this.m31,
        this.m32,
        this.m33,
        this.m34,
        this.m41,
        this.m42,
        this.m43,
        this.m44
      ] = arr
      this.is2D = false
      this.a = this.m11
      this.b = this.m12
      this.c = this.m21
      this.d = this.m22
      this.e = this.m41
      this.f = this.m42
    }
  }

  private setFromInit(init: DOMMatrixInit) {
    this.set2DComponentsFromInit(init)
    this.set4x4ComponentsFromInit(init)
    this.setIs2DFromInit(init)
  }

  private set2DComponentsFromInit(init: DOMMatrixInit) {
    if (init.a !== undefined) this.a = init.a
    if (init.b !== undefined) this.b = init.b
    if (init.c !== undefined) this.c = init.c
    if (init.d !== undefined) this.d = init.d
    if (init.e !== undefined) this.e = init.e
    if (init.f !== undefined) this.f = init.f
  }

  private set4x4ComponentsFromInit(init: DOMMatrixInit) {
    this.set4x4FirstRowFromInit(init)
    this.set4x4SecondRowFromInit(init)
    this.set4x4ThirdRowFromInit(init)
    this.set4x4FourthRowFromInit(init)
  }

  private set4x4FirstRowFromInit(init: DOMMatrixInit) {
    if (init.m11 !== undefined) this.m11 = init.m11
    if (init.m12 !== undefined) this.m12 = init.m12
    if (init.m13 !== undefined) this.m13 = init.m13
    if (init.m14 !== undefined) this.m14 = init.m14
  }

  private set4x4SecondRowFromInit(init: DOMMatrixInit) {
    if (init.m21 !== undefined) this.m21 = init.m21
    if (init.m22 !== undefined) this.m22 = init.m22
    if (init.m23 !== undefined) this.m23 = init.m23
    if (init.m24 !== undefined) this.m24 = init.m24
  }

  private set4x4ThirdRowFromInit(init: DOMMatrixInit) {
    if (init.m31 !== undefined) this.m31 = init.m31
    if (init.m32 !== undefined) this.m32 = init.m32
    if (init.m33 !== undefined) this.m33 = init.m33
    if (init.m34 !== undefined) this.m34 = init.m34
  }

  private set4x4FourthRowFromInit(init: DOMMatrixInit) {
    if (init.m41 !== undefined) this.m41 = init.m41
    if (init.m42 !== undefined) this.m42 = init.m42
    if (init.m43 !== undefined) this.m43 = init.m43
    if (init.m44 !== undefined) this.m44 = init.m44
  }

  private setIs2DFromInit(init: DOMMatrixInit) {
    if (init.is2D !== undefined) this.is2D = init.is2D
  }

  private sync2DTo4x4() {
    if (this.is2D) {
      this.m11 = this.a
      this.m12 = this.b
      this.m21 = this.c
      this.m22 = this.d
      this.m41 = this.e
      this.m42 = this.f
    }
    this.updateIsIdentity()
  }

  private updateIsIdentity() {
    this.isIdentity =
      this.m11 === 1 &&
      this.m12 === 0 &&
      this.m13 === 0 &&
      this.m14 === 0 &&
      this.m21 === 0 &&
      this.m22 === 1 &&
      this.m23 === 0 &&
      this.m24 === 0 &&
      this.m31 === 0 &&
      this.m32 === 0 &&
      this.m33 === 1 &&
      this.m34 === 0 &&
      this.m41 === 0 &&
      this.m42 === 0 &&
      this.m43 === 0 &&
      this.m44 === 1
  }

  multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
    const result = new DOMMatrixPolyfill()
    result.a = this.a * other.a + this.c * other.b
    result.b = this.b * other.a + this.d * other.b
    result.c = this.a * other.c + this.c * other.d
    result.d = this.b * other.c + this.d * other.d
    result.e = this.a * other.e + this.c * other.f + this.e
    result.f = this.b * other.e + this.d * other.f + this.f
    result.sync2DTo4x4()
    return result
  }

  translate(tx: number, ty: number, tz = 0): DOMMatrixPolyfill {
    const t = new DOMMatrixPolyfill()
    t.e = tx
    t.f = ty
    t.m43 = tz
    t.sync2DTo4x4()
    return this.multiply(t)
  }

  scale(sx: number, sy?: number, sz = 1): DOMMatrixPolyfill {
    const s = new DOMMatrixPolyfill()
    s.a = sx
    s.d = sy ?? sx
    s.m33 = sz
    s.sync2DTo4x4()
    return this.multiply(s)
  }

  rotate(angle: number): DOMMatrixPolyfill {
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const r = new DOMMatrixPolyfill()
    r.a = cos
    r.b = sin
    r.c = -sin
    r.d = cos
    r.sync2DTo4x4()
    return this.multiply(r)
  }

  inverse(): DOMMatrixPolyfill {
    const det = this.a * this.d - this.b * this.c
    if (det === 0) {
      return new DOMMatrixPolyfill([NaN, NaN, NaN, NaN, NaN, NaN])
    }
    const result = new DOMMatrixPolyfill()
    result.a = this.d / det
    result.b = -this.b / det
    result.c = -this.c / det
    result.d = this.a / det
    result.e = (this.c * this.f - this.d * this.e) / det
    result.f = (this.b * this.e - this.a * this.f) / det
    result.sync2DTo4x4()
    return result
  }

  transformPoint(point: { x: number; y: number }): {
    x: number
    y: number
    z: number
    w: number
  } {
    return {
      x: this.a * point.x + this.c * point.y + this.e,
      y: this.b * point.x + this.d * point.y + this.f,
      z: 0,
      w: 1
    }
  }

  toFloat32Array(): Float32Array {
    return new Float32Array([
      this.m11,
      this.m12,
      this.m13,
      this.m14,
      this.m21,
      this.m22,
      this.m23,
      this.m24,
      this.m31,
      this.m32,
      this.m33,
      this.m34,
      this.m41,
      this.m42,
      this.m43,
      this.m44
    ])
  }

  toFloat64Array(): Float64Array {
    return new Float64Array([
      this.m11,
      this.m12,
      this.m13,
      this.m14,
      this.m21,
      this.m22,
      this.m23,
      this.m24,
      this.m31,
      this.m32,
      this.m33,
      this.m34,
      this.m41,
      this.m42,
      this.m43,
      this.m44
    ])
  }

  toString(): string {
    if (this.is2D) {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`
    }
    return `matrix3d(${this.m11}, ${this.m12}, ${this.m13}, ${this.m14}, ${this.m21}, ${this.m22}, ${this.m23}, ${this.m24}, ${this.m31}, ${this.m32}, ${this.m33}, ${this.m34}, ${this.m41}, ${this.m42}, ${this.m43}, ${this.m44})`
  }

  static fromMatrix(
    other: DOMMatrixPolyfill | DOMMatrixInit
  ): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(other as DOMMatrixInit)
  }

  static fromFloat32Array(array: Float32Array): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(Array.from(array))
  }

  static fromFloat64Array(array: Float64Array): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(Array.from(array))
  }
}

if (typeof globalThis.DOMMatrix === 'undefined') {
  ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrixPolyfill
}

if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  ;(globalThis as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixPolyfill
}

if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  ;(globalThis as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixPolyfill
}

export { DOMMatrixPolyfill }
