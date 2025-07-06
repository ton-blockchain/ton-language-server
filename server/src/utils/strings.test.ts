//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {trimPrefix, trimSuffix, toPascalCase} from "./strings"

describe("String utils", () => {
    describe("trimSuffix", () => {
        it("should remove suffix if present", () => {
            expect(trimSuffix("hello.txt", ".txt")).toBe("hello")
            expect(trimSuffix("document.pdf", ".pdf")).toBe("document")
        })

        it("should not modify string if suffix is not present", () => {
            expect(trimSuffix("hello.txt", ".pdf")).toBe("hello.txt")
            expect(trimSuffix("hello", ".txt")).toBe("hello")
        })
    })

    describe("trimPrefix", () => {
        it("should remove prefix if present", () => {
            expect(trimPrefix("$price", "$")).toBe("price")
            expect(trimPrefix("https://example.com", "https://")).toBe("example.com")
        })

        it("should not modify string if prefix is not present", () => {
            expect(trimPrefix("price", "$")).toBe("price")
            expect(trimPrefix("example.com", "http://")).toBe("example.com")
        })
    })

    describe("toPascalCase", () => {
        it("should convert snake_case to PascalCase", () => {
            expect(toPascalCase("hello_world")).toBe("HelloWorld")
            expect(toPascalCase("user_first_name")).toBe("UserFirstName")
            expect(toPascalCase("api_response_data")).toBe("ApiResponseData")
        })

        it("should convert kebab-case to PascalCase", () => {
            expect(toPascalCase("hello-world")).toBe("HelloWorld")
            expect(toPascalCase("user-profile-settings")).toBe("UserProfileSettings")
            expect(toPascalCase("api-version-2")).toBe("ApiVersion2")
        })

        it("should convert camelCase to PascalCase", () => {
            expect(toPascalCase("helloWorld")).toBe("HelloWorld")
            expect(toPascalCase("userProfileData")).toBe("UserProfileData")
            expect(toPascalCase("apiResponse")).toBe("ApiResponse")
        })

        it("should handle mixed cases correctly", () => {
            expect(toPascalCase("user_Profile-data")).toBe("UserProfileData")
            expect(toPascalCase("Api-response_data")).toBe("ApiResponseData")
            expect(toPascalCase("mixed_CASE-test")).toBe("MixedCASETest")
        })

        it("should handle edge cases", () => {
            expect(toPascalCase("")).toBe("")
            expect(toPascalCase("a")).toBe("A")
            expect(toPascalCase("___")).toBe("")
            expect(toPascalCase("---")).toBe("")
            expect(toPascalCase("_hello_")).toBe("Hello")
        })
    })
})
