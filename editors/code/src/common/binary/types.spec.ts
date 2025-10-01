import {Address} from "@ton/core"

import {
    AddressNone,
    FlattenParsedObject,
    ParsedObject,
    unflattenParsedObject,
    flattenParsedObject,
} from "./types"

describe("unflattenParsedObject", () => {
    it("should return empty object for empty input", () => {
        const input: FlattenParsedObject = {}
        const result = unflattenParsedObject(input)
        expect(result).toEqual({})
    })

    it("should handle flat object without dots", () => {
        const input: FlattenParsedObject = {
            a: 1n,
            b: "test",
            c: true,
        }
        const result = unflattenParsedObject(input)
        expect(result).toEqual({
            a: 1n,
            b: "test",
            c: true,
        })
    })

    it("should handle single level nesting", () => {
        const input: FlattenParsedObject = {
            "foo.bar": 10n,
            "foo.baz": "hello",
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            foo: {
                $: "nested-object",
                name: "foo",
                value: {
                    bar: 10n,
                    baz: "hello",
                },
            },
        }

        expect(result).toEqual(expected)
    })

    it("should handle multiple top-level nested objects", () => {
        const input: FlattenParsedObject = {
            "user.name": "John",
            "user.age": 30n,
            "config.theme": "dark",
            "config.lang": "en",
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            user: {
                $: "nested-object",
                name: "user",
                value: {
                    name: "John",
                    age: 30n,
                },
            },
            config: {
                $: "nested-object",
                name: "config",
                value: {
                    theme: "dark",
                    lang: "en",
                },
            },
        }

        expect(result).toEqual(expected)
    })

    it("should handle deep nesting", () => {
        const input: FlattenParsedObject = {
            "a.b.c.d": 42n,
            "a.b.e": "value",
            "a.f": true,
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            a: {
                $: "nested-object",
                name: "a",
                value: {
                    b: {
                        $: "nested-object",
                        name: "b",
                        value: {
                            c: {
                                $: "nested-object",
                                name: "c",
                                value: {
                                    d: 42n,
                                },
                            },
                            e: "value",
                        },
                    },
                    f: true,
                },
            },
        }

        expect(result).toEqual(expected)
    })

    it("should handle mixed flat and nested properties", () => {
        const input: FlattenParsedObject = {
            id: 123n,
            "data.name": "Alice",
            "data.settings.theme": "light",
            active: true,
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            id: 123n,
            data: {
                $: "nested-object",
                name: "data",
                value: {
                    name: "Alice",
                    settings: {
                        $: "nested-object",
                        name: "settings",
                        value: {
                            theme: "light",
                        },
                    },
                },
            },
            active: true,
        }

        expect(result).toEqual(expected)
    })

    it("should handle complex TON types", () => {
        const addr = Address.parse(
            "0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e",
        )
        const addrNone = new AddressNone()

        const input: FlattenParsedObject = {
            "msg.sender": addr,
            "msg.amount": 1000000000n,
            "msg.recipient": addrNone,
            "meta.timestamp": 1234567890n,
            "meta.flags": true,
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            msg: {
                $: "nested-object",
                name: "msg",
                value: {
                    sender: addr,
                    amount: 1000000000n,
                    recipient: addrNone,
                },
            },
            meta: {
                $: "nested-object",
                name: "meta",
                value: {
                    timestamp: 1234567890n,
                    flags: true,
                },
            },
        }

        expect(result).toEqual(expected)
    })

    it("should handle nested objects with null/undefined values", () => {
        const input: FlattenParsedObject = {
            "data.value": null,
            "data.optional": undefined,
            "data.present": "here",
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            data: {
                $: "nested-object",
                name: "data",
                value: {
                    value: null,
                    optional: undefined,
                    present: "here",
                },
            },
        }

        expect(result).toEqual(expected)
    })

    it("should handle single property in nested object", () => {
        const input: FlattenParsedObject = {
            "config.enabled": true,
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            config: {
                $: "nested-object",
                name: "config",
                value: {
                    enabled: true,
                },
            },
        }

        expect(result).toEqual(expected)
    })

    it("should merge multiple properties into same nested object", () => {
        const input: FlattenParsedObject = {
            "user.profile.name": "Bob",
            "user.profile.age": 25n,
            "user.settings.theme": "dark",
            "user.settings.notifications": false,
            "user.id": 456n,
        }
        const result = unflattenParsedObject(input)

        const expected: ParsedObject = {
            user: {
                $: "nested-object",
                name: "user",
                value: {
                    profile: {
                        $: "nested-object",
                        name: "profile",
                        value: {
                            name: "Bob",
                            age: 25n,
                        },
                    },
                    settings: {
                        $: "nested-object",
                        name: "settings",
                        value: {
                            theme: "dark",
                            notifications: false,
                        },
                    },
                    id: 456n,
                },
            },
        }

        expect(result).toEqual(expected)
    })
})

describe("flattenParsedObject", () => {
    it("should return empty object for empty input", () => {
        const input: ParsedObject = {}
        const result = flattenParsedObject(input)
        expect(result).toEqual({})
    })

    it("should handle flat object without nested objects", () => {
        const input: ParsedObject = {
            a: 1n,
            b: "test",
            c: true,
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            a: 1n,
            b: "test",
            c: true,
        })
    })

    it("should handle single level nesting", () => {
        const input: ParsedObject = {
            foo: {
                $: "nested-object",
                name: "foo",
                value: {
                    bar: 10n,
                    baz: "hello",
                },
            },
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            "foo.bar": 10n,
            "foo.baz": "hello",
        })
    })

    it("should handle multiple top-level nested objects", () => {
        const input: ParsedObject = {
            user: {
                $: "nested-object",
                name: "user",
                value: {
                    name: "John",
                    age: 30n,
                },
            },
            config: {
                $: "nested-object",
                name: "config",
                value: {
                    theme: "dark",
                    lang: "en",
                },
            },
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            "user.name": "John",
            "user.age": 30n,
            "config.theme": "dark",
            "config.lang": "en",
        })
    })

    it("should handle deep nesting", () => {
        const input: ParsedObject = {
            a: {
                $: "nested-object",
                name: "a",
                value: {
                    b: {
                        $: "nested-object",
                        name: "b",
                        value: {
                            c: {
                                $: "nested-object",
                                name: "c",
                                value: {
                                    d: 42n,
                                },
                            },
                            e: "value",
                        },
                    },
                    f: true,
                },
            },
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            "a.b.c.d": 42n,
            "a.b.e": "value",
            "a.f": true,
        })
    })

    it("should handle mixed flat and nested properties", () => {
        const input: ParsedObject = {
            id: 123n,
            data: {
                $: "nested-object",
                name: "data",
                value: {
                    name: "Alice",
                    settings: {
                        $: "nested-object",
                        name: "settings",
                        value: {
                            theme: "light",
                        },
                    },
                },
            },
            active: true,
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            id: 123n,
            "data.name": "Alice",
            "data.settings.theme": "light",
            active: true,
        })
    })

    it("should handle complex TON types", () => {
        const addr = Address.parse(
            "0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e",
        )
        const addrNone = new AddressNone()

        const input: ParsedObject = {
            msg: {
                $: "nested-object",
                name: "msg",
                value: {
                    sender: addr,
                    amount: 1000000000n,
                    recipient: addrNone,
                },
            },
            meta: {
                $: "nested-object",
                name: "meta",
                value: {
                    timestamp: 1234567890n,
                    flags: true,
                },
            },
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            "msg.sender": addr,
            "msg.amount": 1000000000n,
            "msg.recipient": addrNone,
            "meta.timestamp": 1234567890n,
            "meta.flags": true,
        })
    })

    it("should handle nested objects with null/undefined values", () => {
        const input: ParsedObject = {
            data: {
                $: "nested-object",
                name: "data",
                value: {
                    value: null,
                    optional: undefined,
                    present: "here",
                },
            },
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            "data.value": null,
            "data.optional": undefined,
            "data.present": "here",
        })
    })

    it("should handle single property in nested object", () => {
        const input: ParsedObject = {
            config: {
                $: "nested-object",
                name: "config",
                value: {
                    enabled: true,
                },
            },
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            "config.enabled": true,
        })
    })

    it("should merge multiple properties into same nested object", () => {
        const input: ParsedObject = {
            user: {
                $: "nested-object",
                name: "user",
                value: {
                    profile: {
                        $: "nested-object",
                        name: "profile",
                        value: {
                            name: "Bob",
                            age: 25n,
                        },
                    },
                    settings: {
                        $: "nested-object",
                        name: "settings",
                        value: {
                            theme: "dark",
                            notifications: false,
                        },
                    },
                    id: 456n,
                },
            },
        }
        const result = flattenParsedObject(input)
        expect(result).toEqual({
            "user.profile.name": "Bob",
            "user.profile.age": 25n,
            "user.settings.theme": "dark",
            "user.settings.notifications": false,
            "user.id": 456n,
        })
    })
})

describe("roundtrip conversion", () => {
    it("should roundtrip flatten -> unflatten -> flatten", () => {
        const originalFlat: FlattenParsedObject = {
            "user.name": "Alice",
            "user.age": 30n,
            "user.settings.theme": "dark",
            "user.settings.notifications": true,
            "config.lang": "en",
            "data.value": null,
            simple: 42n,
        }

        const nested = unflattenParsedObject(originalFlat)
        const flattened = flattenParsedObject(nested)

        expect(flattened).toEqual(originalFlat)
    })

    it("should roundtrip unflatten -> flatten -> unflatten", () => {
        const originalNested: ParsedObject = {
            user: {
                $: "nested-object",
                name: "user",
                value: {
                    name: "Bob",
                    profile: {
                        $: "nested-object",
                        name: "profile",
                        value: {
                            age: 25n,
                            city: "NYC",
                        },
                    },
                },
            },
            config: {
                $: "nested-object",
                name: "config",
                value: {
                    theme: "light",
                    enabled: false,
                },
            },
            id: 123n,
        }

        const flat = flattenParsedObject(originalNested)
        const nested = unflattenParsedObject(flat)

        expect(nested).toEqual(originalNested)
    })

    it("should roundtrip with complex TON types", () => {
        const addr = Address.parse(
            "0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e",
        )
        const addrNone = new AddressNone()

        const originalFlat: FlattenParsedObject = {
            "msg.sender": addr,
            "msg.amount": 1000000000n,
            "msg.recipient": addrNone,
            "msg.data.payload": "test",
            "meta.timestamp": 1234567890n,
            "meta.flags.enabled": true,
            "meta.flags.debug": false,
        }

        const nested = unflattenParsedObject(originalFlat)
        const flattened = flattenParsedObject(nested)

        expect(flattened).toEqual(originalFlat)
    })

    it("should roundtrip with empty objects", () => {
        const emptyFlat: FlattenParsedObject = {}
        const nested = unflattenParsedObject(emptyFlat)
        const flattened = flattenParsedObject(nested)

        expect(flattened).toEqual(emptyFlat)
        expect(nested).toEqual({})
    })

    it("should roundtrip with single level nesting", () => {
        const originalFlat: FlattenParsedObject = {
            "a.b": 1n,
            "a.c": "test",
            d: true,
        }

        const nested = unflattenParsedObject(originalFlat)
        const flattened = flattenParsedObject(nested)

        expect(flattened).toEqual(originalFlat)
    })

    it("should roundtrip with deep nesting", () => {
        const originalFlat: FlattenParsedObject = {
            "x.y.z.w": 42n,
            "x.y.z.v": "deep",
            "x.y.a": true,
            "x.b": null,
            c: "top",
        }

        const nested = unflattenParsedObject(originalFlat)
        const flattened = flattenParsedObject(nested)

        expect(flattened).toEqual(originalFlat)
    })

    it("should handle undefined values in roundtrip", () => {
        const originalFlat: FlattenParsedObject = {
            "data.value": undefined,
            "data.present": "here",
            other: 123n,
        }

        const nested = unflattenParsedObject(originalFlat)
        const flattened = flattenParsedObject(nested)

        expect(flattened).toEqual(originalFlat)
    })
})
