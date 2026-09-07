import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const LANGUAGES = ['en', 'fr', 'it', 'es', 'pt', 'uk', 'pl', 'be', 'de', 'hr', 'tr'];

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsIn(LANGUAGES)
  language?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
