jest.mock(
    "vscode",
    () => ({
        Uri: {
            parse: jest.fn(),
        },
    }),
    {virtual: true},
)

import {parseTeamCityMessage} from "./TeamCity"

describe("TeamCity service message parser", () => {
    it("keeps test duration attributes for finished tests", () => {
        const message = parseTeamCityMessage(
            "##teamcity[testFinished name='test alpha' nodeId='2' duration='37']",
        )

        expect(message).toEqual({
            name: "testFinished",
            attributes: {
                name: "test alpha",
                nodeId: "2",
                duration: "37",
            },
        })
    })

    it("keeps test duration attributes for failed tests", () => {
        const message = parseTeamCityMessage(
            "##teamcity[testFailed name='test alpha' duration='41' message='boom']",
        )

        expect(message).toEqual({
            name: "testFailed",
            attributes: {
                name: "test alpha",
                duration: "41",
                message: "boom",
            },
        })
    })
})
