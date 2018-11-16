import should from "should";

import { hasValidProps, validateProps } from "../src/type_check";

describe("validateProps", () => {

    it("Should return on match", () => {
        const obj = {
            a: "str",
            b: 2,
        };

        // Shouldn't throw
        validateProps("TestObj", obj, {
            a: "string",
            b: "number",
        });
    });

    it("Should throw and describe mismatched property", () => {
        const obj = {
            a: "str",
            b: 2,
        };

        should(() => validateProps("TestObj", obj, {
            a: "string",
            b: "string",
        })).throwError(/Error validating TestObj: property 'b' is not a string/);
    });

    it("Should throw and describe missing property", () => {
        const obj = {
            a: "str",
        };

        should(() => validateProps("TestObj", obj, {
            a: "string",
            b: "string",
        })).throwError(/Error validating TestObj: string property 'b' is missing/);
    });

    it("Should throw on null obj", () => {
        should(() => validateProps("TestObj", null, {
            a: "string",
            b: "string",
        })).throwError(/Error validating TestObj: not a valid object/);
    });

    it("Should throw on undefined obj", () => {
        should(() => validateProps("TestObj", undefined, {
            a: "string",
            b: "string",
        })).throwError(/Error validating TestObj: not a valid object/);
    });

    it("Should throw on primitive obj", () => {
        should(() => validateProps("TestObj", "not an obj", {
            a: "string",
            b: "string",
        })).throwError(/Error validating TestObj: not a valid object/);
    });

});

describe("hasValidProps", () => {

    it("Should return true on match", () => {
        const obj = {
            a: "str",
            b: 2,
        };

        should(hasValidProps(obj, {
            a: "string",
            b: "number",
        })).be.True();
    });

    it("Should return false on mismatch", () => {
        const obj = {
            a: "str",
            b: 2,
        };

        should(hasValidProps(obj, {
            a: "string",
            b: "string",
        })).be.False();
    });

    it("Should return false on missing", () => {
        const obj = {
            a: "str",
        };

        should(hasValidProps(obj, {
            a: "string",
            b: "string",
        })).be.False();
    });

    it("Should return false on null obj", () => {
        should(hasValidProps(null, {
            a: "string",
            b: "string",
        })).be.False();
    });

    it("Should return false on undefined obj", () => {
        should(hasValidProps(undefined, {
            a: "string",
            b: "string",
        })).be.False();
    });

    it("Should return false on invalid obj", () => {
        should(hasValidProps("a string", {
            a: "string",
            b: "string",
        })).be.False();
    });

});
