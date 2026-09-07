import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DesignProjectService } from "../src/features/design-projects/main/design-project-service.js";

test("design projects persist exact four-mode artifacts and reconstructable metadata", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"getgo-design-")); const service=new DesignProjectService(root); const project=await service.create({name:"Learning home",description:"",instructions:"Keep one mascot",references:[]});
  const html=Object.fromEntries(["portrait-light","portrait-dark","landscape-light","landscape-dark"].map(key=>[key,`<!doctype html><title>${key}</title>`]));
  const saved=await service.saveGenerated(project.id,{name:"Profile",request:"Create a profile"},{specification:{tokens:{color:"violet"}},html,images:Object.fromEntries(Object.keys(html).map(key=>[key,Buffer.from(key).toString("base64")])),assets:[{id:"fox-wave",name:"Fox",description:"Mascot",png:Buffer.from("asset").toString("base64")}]});
  assert.equal(saved.page.artifacts.length,4); assert.equal(saved.page.assets[0].fileName,"assets/fox-wave.png"); assert.deepEqual(JSON.parse(await readFile(path.join(service.folder(project.id),"pages",saved.page.slug,"design.json"),"utf8")),{tokens:{color:"violet"}});
});

test("legacy reconstruction is imported once as a managed design project", async () => {
  const base=await mkdtemp(path.join(os.tmpdir(),"getgo-design-legacy-")),root=path.join(base,"projects"),legacy=path.join(base,"legacy"); await mkdir(legacy,{recursive:true}); await writeFile(path.join(legacy,"index.html"),"<!doctype html>"); const service=new DesignProjectService(root,legacy);
  const first=await service.list(),second=await service.list(); assert.equal(first.length,1); assert.equal(second.length,1); assert.deepEqual((await service.load("kids-ui-reconstruction")).pages.map(page=>page.id),["login","profile","ranking","student-switch"]);
});
