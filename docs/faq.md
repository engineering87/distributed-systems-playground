# Questions, related tools and references

## Frequently asked questions

**Do I need to install anything?**
No. Open the live demo or the `index.html` file. Node.js is only needed to run the tests or rebuild the page.

**Does it work offline?**
Yes, once the file is on your machine. Without a network connection the page falls back to system fonts.

**Why a custom pseudocode instead of JavaScript?**
Because the goal is to run the algorithms as they appear in books and papers. Upon keeps the event-driven structure, the pattern matching and the set notation, and the checker can relate the code to the timing model, which a general-purpose language could not do.

**Is a result from the playground a proof?**
No. A run shows one execution. It can reveal a bug, and it can build confidence, but only a proof or an exhaustive model checker can show that an algorithm is correct.

**Can I use it in my course?**
Yes. The project is MIT-licensed. Scenarios can be distributed as JSON files or links, and results are reproducible from the seed.

## Related tools

| Tool | Focus |
|---|---|
| [TLA+](https://lamport.azurewebsites.net/tla/tla.html) | specifying systems and model checking all their behaviors |
| [Maelstrom](https://github.com/jepsen-io/maelstrom) | testing real implementations of distributed protocols against simulated networks |
| [DSLabs](https://github.com/emichael/dslabs) | assignments in Java with model checking and a visual debugger |
| [ShiViz](https://bestchai.bitbucket.io/shiviz/) | drawing space-time diagrams from logs of real systems |
| [DistAlgo](https://github.com/DistAlgo/distalgo) | a Python-based language for writing and running distributed algorithms |

Distributed Systems Playground sits next to these tools rather than replacing them. It targets the first contact with an algorithm: textbook notation, zero setup, a visual execution, and explicit control over the gap between the assumed and the actual timing model.

## References

- C. Cachin, R. Guerraoui, L. Rodrigues. *Introduction to Reliable and Secure Distributed Programming*, 2nd ed. Springer, 2011.
- L. Lamport. Time, Clocks, and the Ordering of Events in a Distributed System. *Communications of the ACM* 21(7), 1978.
- L. Lamport, R. Shostak, M. Pease. The Byzantine Generals Problem. *ACM Transactions on Programming Languages and Systems* 4(3), 1982.
- M. J. Fischer, N. A. Lynch, M. S. Paterson. Impossibility of Distributed Consensus with One Faulty Process. *Journal of the ACM* 32(2), 1985.
- C. Dwork, N. Lynch, L. Stockmeyer. Consensus in the Presence of Partial Synchrony. *Journal of the ACM* 35(2), 1988.
- T. D. Chandra, S. Toueg. Unreliable Failure Detectors for Reliable Distributed Systems. *Journal of the ACM* 43(2), 1996.
- E. Chang, R. Roberts. An Improved Algorithm for Decentralized Extrema-Finding in Circular Configurations of Processes. *Communications of the ACM* 22(5), 1979.
- N. Lynch. *Distributed Algorithms*. Morgan Kaufmann, 1996.
