# Third-party components

- War Room: Three.js 0.180.0 (MIT, https://github.com/mrdoob/three.js), React Three Fiber 9.8.2 (MIT, https://github.com/pmndrs/react-three-fiber), Drei 10.7.9 (MIT, https://github.com/pmndrs/drei). Exact dependency versions and transitive licenses are in `frontend/package-lock.json`. No downloaded models, textures, HDRIs, remote fonts, or character assets are used. Building, equipment and avatars are authored procedurally in this repository.
- Spring WebSocket uses the Spring Boot 3.5.7 dependency management (Apache-2.0, https://github.com/spring-projects/spring-framework).

- Next.js / React / Tailwind CSS / Radix Slot / shadcn/ui Button pattern / React Flow / Lucide: package versions and licenses are recorded in frontend/package-lock.json and upstream packages.
- Spring Boot, PostgreSQL JDBC, Neo4j Java driver, Apache POI, PDFBox and Flyway: versions in backend/pom.xml.
- Nanum Gothic Regular: SIL Open Font License, included at backend/src/main/resources/fonts/OFL.txt.
- jevos-v4 binary/model: downloaded from the user-specified feder-cr/jev release; original license and third-party notices stay with the downloaded release. Model/runtime files are not committed or included in the source archive.
- Windows app-local runtime helper copies only the user's already-installed Microsoft VCLibs package. Microsoft runtime binaries are not redistributed in this source project.
