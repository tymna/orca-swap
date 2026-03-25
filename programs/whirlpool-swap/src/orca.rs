use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::invoke;

pub const WHIRLPOOL_PROGRAM_ID: Pubkey =
pubkey!("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
const SWAP_DISCRIMINATOR: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];

pub fn swap_cpi(
    ctx: &Context<crate::instructions::swap::Swap>,
    amount: u64,
    other_amount_threshold: u64,
    sqrt_price_limit: u128,
    amount_specified_is_input: bool,
    a_to_b: bool,
) -> Result<()> {
    // build Account Meta
    // .key() -> pubKey
    let accounts = vec![
        AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.token_authority.key(), true), // true because he is a signer
        AccountMeta::new(ctx.accounts.whirlpool.key(), false),
        AccountMeta::new(ctx.accounts.token_owner_account_a.key(), false),
        AccountMeta::new(ctx.accounts.token_vault_a.key(), false),
        AccountMeta::new(ctx.accounts.token_owner_account_b.key(), false),
        AccountMeta::new(ctx.accounts.token_vault_b.key(), false),
        AccountMeta::new(ctx.accounts.tick_array_0.key(), false),
        AccountMeta::new(ctx.accounts.tick_array_1.key(), false),
        AccountMeta::new(ctx.accounts.tick_array_2.key(), false),
        AccountMeta::new_readonly(ctx.accounts.oracle.key(), false),
    ];
    // build data array
     let mut data: Vec<u8> = Vec::with_capacity(8 + 8 + 8 + 16 + 1 + 1);
     data.extend_from_slice(&SWAP_DISCRIMINATOR); // 8
     data.extend_from_slice(&amount.to_le_bytes()); // 8
     data.extend_from_slice(&other_amount_threshold.to_le_bytes()); // 8
     data.extend_from_slice(&sqrt_price_limit.to_le_bytes()); // 16
     data.push(amount_specified_is_input as u8);
     data.push(a_to_b as u8);
     
     // build Instruction
     let ix: Instruction = Instruction {
         program_id: WHIRLPOOL_PROGRAM_ID,
         accounts, // AccountMeta
         data,
        };

        
    // build Account List
    // to_account_info() -> everything
    let account_infos = vec![
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.accounts.whirlpool.to_account_info(),
        ctx.accounts.token_owner_account_a.to_account_info(),
        ctx.accounts.token_vault_a.to_account_info(),
        ctx.accounts.token_owner_account_b.to_account_info(),
        ctx.accounts.token_vault_b.to_account_info(),
        ctx.accounts.tick_array_0.to_account_info(),
        ctx.accounts.tick_array_1.to_account_info(),
        ctx.accounts.tick_array_2.to_account_info(),
        ctx.accounts.oracle.to_account_info(),
    ];

    invoke(&ix, &account_infos)?;
    Ok(())
}