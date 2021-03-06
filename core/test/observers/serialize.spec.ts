/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    prepareAllObservationsForJson,
    reconstituteAllObservations
} from "../../src/observers/serialize";

import should from "should";

describe("Observation Reconstitution Tests", () => {
    it("Should reconstitute empty observations", () => {
        const cand = {};
        const obs = reconstituteAllObservations(cand);
        should(obs).eql(cand);
    });

    it("Should reconstitute single observation with no queries", () => {
        const cand = {
            foo: {
                observations: {
                    data: {}
                },
                queries: []
            }
        };

        const obs = reconstituteAllObservations(cand);
        should(obs).eql(cand);
    });

    it("Should reconstitute single observation with a query", () => {
        const cand = {
            foo: {
                observations: {
                    data: {}
                },
                queries: [
                    { query: "query Foo {\n  fooById(id: $id)\n}\n", variables: { id: 1 } }
                ]
            }
        };

        const obs = reconstituteAllObservations(cand);
        //Also tests prepareAllObservations
        should(prepareAllObservationsForJson(obs)).eql(cand);
    });

    it("Should reject extra fields in ObserverResponse data", () => {
        const cand = {
            foo: {
                observations: {
                    data: {},
                    context: {},
                    foo: true //Illegal
                },
                queries: []
            }
        };

        should(() => reconstituteAllObservations(cand)).throwError(/Illegal keys [\"foo\"]/);
    });

    it("Should reject extra fields in query", () => {
        const cand = {
            foo: {
                observations: {
                    data: {},
                    context: {}
                },
                queries: [{ query: "n/a", foo: true }]
            }
        };

        should(() => reconstituteAllObservations(cand)).throwError(/Illegal keys [\"foo\"]/);
    });

    it("Should reject illegal shape for query variables", () => {
        const cand = {
            foo: {
                observations: {
                    data: {},
                    context: {}
                },
                queries: [{ query: "n/a", variables: [] }]
            }
        };

        should(() => reconstituteAllObservations(cand)).throwError(/Invalid shape/);

        const cand2 = {
            foo: {
                observations: {
                    data: {},
                    context: {}
                },
                queries: [{ query: "n/a", variables: true }]
            }
        };

        should(() => reconstituteAllObservations(cand2)).throwError(/Invalid shape/);
    });

    it("Should reject illegal shape for query type", () => {
        const cand = {
            foo: {
                observations: {
                    data: {},
                    context: {}
                },
                queries: [{ query: true }]
            }
        };

        should(() => reconstituteAllObservations(cand)).throwError(/Invalid shape/);
    });

    it("Should reject illegal shape for missing query", () => {
        const cand = {
            foo: {
                observations: {
                    data: {},
                    context: {}
                },
                queries: [{}]
            }
        };

        should(() => reconstituteAllObservations(cand)).throwError(/Invalid shape/);
    });

});
