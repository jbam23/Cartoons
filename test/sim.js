const { expect } = require('chai');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { network, ethers } = require("hardhat");


describe('Cartoons NFT Tests', () => {
    let leafNodes,merkleTree,cartoons,rootHash,leaf,hexProof;
    beforeEach(async () => {
        [whitelist1,whitelist2,whitelist3,whitelist4,whitelist5,whitelist6,whitelist7,hacker,unverifiedMinter] = await ethers.getSigners();
        cartoonsFactory = await ethers.getContractFactory('Cartoons');
        exploitFactory = await ethers.getContractFactory('ExploitSim');

        let whitelist = [
            whitelist1.address,
            whitelist2.address,
            whitelist3.address,
            whitelist4.address,
            whitelist5.address,
            whitelist6.address
        ]
        
        leafNodes = whitelist.map(item => keccak256(item))
        merkleTree = new MerkleTree(leafNodes, keccak256, {sortPairs: true});
        rootHash = merkleTree.getRoot();
        leaf = leafNodes[0]
        hexProof = merkleTree.getHexProof(leaf)
    
        cartoons = await cartoonsFactory.deploy(rootHash,2);
        // console.log("Root = " + rootHash.toString('hex'))
        // console.log("Proof = " + hexProof)
        // console.log("Whitelist Merkle Tree \n", merkleTree.toString());
        // console.log("Cartoons Deployed to: "+ cartoons.address)

    });


    it('Cartoons Test Whitelist and Public Mint:', async () => {
        ////////////////// TEST WHITELIST MINT //////////////////
        await expect(cartoons.connect(whitelist1).whitelistMint(hexProof,1,{value: ethers.utils.parseEther('0.07')})).to.be.revertedWith('Cartoons Whitelist Mint Not Active')
        await expect(cartoons.connect(hacker).setWhitelistMintActive(true)).to.be.revertedWith('Ownable: caller is not the owner')
        await cartoons.setWhitelistMintActive(true)

        // Whitelist mint from whitelist1 and verify contract is tracking count properly
        await cartoons.connect(whitelist1).whitelistMint(hexProof,1,{value: ethers.utils.parseEther('0.07')})
        expect(await cartoons.connect(whitelist1).getAllowedMintAmount(hexProof,whitelist1.address)).to.equal('1')
        await cartoons.connect(whitelist1).whitelistMint(hexProof,1,{value: ethers.utils.parseEther('0.07')})
        expect(await cartoons.connect(whitelist1).getAllowedMintAmount(hexProof,whitelist1.address)).to.equal('0')

        // Whitelist mint from whitelist
        const hexProof2 = merkleTree.getHexProof(keccak256(whitelist2.address))
        await expect(cartoons.connect(whitelist2).whitelistMint(hexProof2,3,{value: ethers.utils.parseEther('0.21')})).to.be.revertedWith('Requested Claim Amount Invalid')  // Try to mint 3 when max should be 1
        await cartoons.connect(whitelist2).whitelistMint(hexProof2,2,{value: ethers.utils.parseEther('0.14')})
        expect(await cartoons.connect(whitelist2).getAllowedMintAmount(hexProof2,whitelist2.address)).to.equal('0')
        await expect(cartoons.connect(whitelist2).whitelistMint(hexProof2,1,{value: ethers.utils.parseEther('0.07')})).to.be.revertedWith('Requested Claim Amount Invalid')  // Try to mint 1 once 2 whitelist mints already used

        ////////////////// TEST PUBLIC MINT //////////////////
        await expect(cartoons.publicMint(1,{value: ethers.utils.parseEther('0.07')})).to.be.revertedWith('Cartoons Public Mint Not Active')
        await cartoons.setPublicMintActive(true)
        await expect(cartoons.publicMint(2,{value: ethers.utils.parseEther('0.14')})).to.be.revertedWith('Requested Mint Amount Exceeds Limit Per Tx')
        await expect(cartoons.publicMint(1,{value: ethers.utils.parseEther('0.069')})).to.be.revertedWith('Incorrect Payment')

        await cartoons.publicMint(1,{value: ethers.utils.parseEther('0.07')})

        ////////////////// TEST PLANT NEW ROOT //////////////////

        // Add Whitelist 7 address to whitelist
        let new_whitelist = [
            whitelist1.address,
            whitelist2.address,
            whitelist3.address,
            whitelist4.address,
            whitelist5.address,
            whitelist6.address,
            whitelist7.address
        ]

        new_leafNodes = new_whitelist.map(item => keccak256(item))
        new_merkleTree = new MerkleTree(new_leafNodes, keccak256, {sortPairs: true});
        new_rootHash = new_merkleTree.getRoot();
        await cartoons.setWhitelistMintActive(false)
        await cartoons.plantNewRoot(new_rootHash,2)
        await cartoons.setWhitelistMintActive(true)
        new_hexProof = new_merkleTree.getHexProof(keccak256(whitelist7.address))    
        await cartoons.connect(whitelist7).whitelistMint(new_hexProof,2,{value: ethers.utils.parseEther('0.14')}) // try to whitelist mint from our new added whitelist7 address

        new_hexProof_WL1 = new_merkleTree.getHexProof(keccak256(whitelist1.address))    // Try to generate proof from new merkle tree from whitelist1 which has already minted 2 from previous root
        await expect(cartoons.connect(whitelist1).whitelistMint(new_hexProof_WL1,1,{value: ethers.utils.parseEther('0.07')})).to.be.revertedWith('Requested Claim Amount Invalid')  // verify that whitelist1 cannot mint anymore from new root

        new_hexProof_WL6 = new_merkleTree.getHexProof(keccak256(whitelist6.address))    
        await cartoons.connect(whitelist6).whitelistMint(new_hexProof_WL6,2,{value: ethers.utils.parseEther('0.14')}) // verify whitelist6 which didnt mint on first root, can mint on new root

        // Test withdraw functionality
        var prov = ethers.provider;
        var prebal1 = await prov.getBalance('0x1A0cAAb1AdDdbB12dd61B7f7873c69C18f80AACf')
        var prebal2 = await prov.getBalance('0xED96E702e654343297D5c56E49C4de4f882f8f8B')
        var prebal3 = await prov.getBalance('0x0515c23D04B3C078e40363B9b3142303004F343c')
        var prebal4 = await prov.getBalance('0x19F32B6D6912023c47BC0DF991d80CAAB52620a3')
        var prebal5 = await prov.getBalance('0xFC56e522504348833BCE63a6c15101d28E9BC1c2')
        var prebal6 = await prov.getBalance('0x7f7602CFba48a032247e403E551886b8A9ea7267')
        var prebal7 = await prov.getBalance('0xbEB82e72F032631E6B3FF0b5Fa04aceA1D6bC0eb')
        await cartoons.withdrawEth()
        var bal1 = await prov.getBalance('0x1A0cAAb1AdDdbB12dd61B7f7873c69C18f80AACf')
        var bal2 = await prov.getBalance('0xED96E702e654343297D5c56E49C4de4f882f8f8B')
        var bal3 = await prov.getBalance('0x0515c23D04B3C078e40363B9b3142303004F343c')
        var bal4 = await prov.getBalance('0x19F32B6D6912023c47BC0DF991d80CAAB52620a3')
        var bal5 = await prov.getBalance('0xFC56e522504348833BCE63a6c15101d28E9BC1c2')
        var bal6 = await prov.getBalance('0x7f7602CFba48a032247e403E551886b8A9ea7267')
        var bal7 = await prov.getBalance('0xbEB82e72F032631E6B3FF0b5Fa04aceA1D6bC0eb')
        await expect(parseInt(bal1._hex)).to.be.greaterThan(parseInt(prebal1._hex))
        await expect(parseInt(bal2._hex)).to.be.greaterThan(parseInt(prebal2._hex))
        await expect(parseInt(bal3._hex)).to.be.greaterThan(parseInt(prebal3._hex))
        await expect(parseInt(bal4._hex)).to.be.greaterThan(parseInt(prebal4._hex))
        await expect(parseInt(bal5._hex)).to.be.greaterThan(parseInt(prebal5._hex))
        await expect(parseInt(bal6._hex)).to.be.greaterThan(parseInt(prebal6._hex))
        await expect(parseInt(bal7._hex)).to.be.greaterThan(parseInt(prebal7._hex))

        
    });

    it('Cartoons Merkle Tree Exploit Sim:', async () => {
        await cartoons.setWhitelistMintActive(true)
        // Try various ways to exploit the merkle tree set up
        // Try to mint from whitelist2 address using whitelist1's proof
        await expect(cartoons.connect(whitelist2).whitelistMint(hexProof,2,{value: ethers.utils.parseEther('0.14')})).to.be.revertedWith('Invalid Proof')
        // Try to append ourselves as the hacker to the whitelist -> generate new merkle tree with us included and generate proof from it
        let hacker_whitelist = [
            whitelist1.address,
            whitelist2.address,
            whitelist3.address,
            whitelist4.address,
            whitelist5.address,
            whitelist6.address,
            hacker.address
        ]
        leafNodesHacker = hacker_whitelist.map(item => keccak256(item))
        merkleTreeHacker = new MerkleTree(leafNodesHacker, keccak256, {sortPairs: true});
        hexProofHacker = merkleTree.getHexProof(keccak256(hacker.address))
        await expect(cartoons.connect(hacker).whitelistMint(hexProofHacker,2,{value: ethers.utils.parseEther('0.14')})).to.be.revertedWith('Invalid Proof')
    })

    
    it('Cartoons Exploit Defense Sim:', async () => {
        const reentrancy = await exploitFactory.deploy(cartoons.address);

        // Try to Multicall and Reentrancy Exploit Ourselves
        await cartoons.setPublicMintActive(true)
        await expect(reentrancy.multicallExploit({value: ethers.utils.parseEther('0.14')})).to.be.revertedWith('Minting from Contract not Allowed') 
        await expect(reentrancy.reentrancyExploit({value: ethers.utils.parseEther('0.14')})).to.be.revertedWith('Minting from Contract not Allowed') 
    });
});
